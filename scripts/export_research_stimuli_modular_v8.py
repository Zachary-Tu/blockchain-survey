"""Build the six-asset M1 stimulus bundle with frozen priority events.

The script extends the v7 four-asset bundle with XRP and Dogecoin price data
from the project-local Li Blockchain archive.  It also replaces the pilot
event annotations for all six assets with the source rows in
``events_20260527.zip``.  The participant interface applies the disclosure
cap at runtime so the same source bundle can support both the full and the
pre-registered truncated observation windows.

Example
-------
python scripts/export_research_stimuli_modular_v8.py \
  --events-zip C:/path/to/events_20260527.zip \
  --price-root E:/path/to/cmc_original_price_data/tsv2026
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

from export_research_stimuli_modular_v7 import build_resolutions, read_daily_open


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "public" / "data" / "research-stimuli-modular-v7.json"
OUTPUT = ROOT / "public" / "data" / "research-stimuli-modular-v8.json"

ASSET_ORDER = ("bitcoin", "ethereum", "solana", "bnb", "xrp", "dogecoin")
ASSET_COPY = {
    "xrp": {
        "name": "XRP",
        "nameZh": "XRP",
        "symbol": "XRP",
        "intro": (
            "XRP Ledger 是 2012 年上线的开放式分布式账本，原生资产 XRP 可用于"
            "点对点与跨币种支付；网络通过验证节点的共识机制确认交易。"
        ),
    },
    "dogecoin": {
        "name": "Dogecoin",
        "nameZh": "狗狗币",
        "symbol": "DOGE",
        "intro": (
            "Dogecoin 是 2013 年上线的点对点数字货币网络，采用 Scrypt 工作量证明；"
            "它起源于网络文化，并长期由开源社区与志愿者维护。"
        ),
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--events-zip", required=True, type=Path)
    parser.add_argument(
        "--price-root",
        required=True,
        type=Path,
        help="Directory containing bitcoin.tsv, ethereum.tsv, solana.tsv, bnb.tsv, xrp.tsv, and dogecoin.tsv",
    )
    parser.add_argument("--output", type=Path, default=OUTPUT)
    return parser.parse_args()


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_events(archive: ZipFile, asset_id: str) -> list[dict[str, object]]:
    member = f"events_20260527/{asset_id}.csv"
    with archive.open(member) as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
        rows: list[dict[str, object]] = []
        for row in reader:
            priority = int(row["priority"])
            rows.append(
                {
                    "sourceId": row["id"].strip(),
                    "date": row["eventDate"].strip(),
                    "title": row["title"].strip(),
                    "description": row["description"].strip(),
                    "category": (row.get("typeName") or row.get("type") or "event").strip(),
                    "sourceUrl": (row.get("readMoreUrl") or "").strip(),
                    "priority": "high" if priority <= 2 else "low",
                    "sourcePriority": priority,
                    "priorityBand": "core" if priority <= 2 else "supplementary",
                    "priorityProtocol": "events-20260527-priority-band-v1",
                }
            )
    return sorted(rows, key=lambda item: (str(item["date"]), str(item["sourceId"])))


def unavailable_metric(template: dict[str, object], asset_id: str) -> dict[str, object]:
    metric = copy.deepcopy(template)
    metric["available"] = False
    metric["unavailableReason"] = (
        f"The six-asset M1 expansion currently includes price data only for {asset_id}."
    )
    metric["source"] = {
        "provider": "not included in the six-asset M1 bundle",
        "assetId": asset_id,
    }
    metric["resolutionAvailability"] = {
        "daily": False,
        "weekly": False,
        "monthly": False,
        "yearly": False,
    }
    metric["resolutions"] = {}
    return metric


def add_asset(payload: dict[str, object], asset_id: str) -> None:
    assets = payload["assets"]
    assert isinstance(assets, list)
    if any(asset["id"] == asset_id for asset in assets):
        return

    template = copy.deepcopy(next(asset for asset in assets if asset["id"] == "bnb"))
    template.update({"id": asset_id, **ASSET_COPY[asset_id], "events": []})
    template["metrics"]["activeAddresses"] = unavailable_metric(
        template["metrics"]["activeAddresses"], asset_id
    )
    template["metrics"]["googleTrends"] = unavailable_metric(
        template["metrics"]["googleTrends"], asset_id
    )
    assets.append(template)


def main() -> None:
    args = parse_args()
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    for asset_id in ASSET_COPY:
        add_asset(payload, asset_id)

    source_windows: dict[str, dict[str, str]] = {}
    with ZipFile(args.events_zip) as archive:
        by_id = {asset["id"]: asset for asset in payload["assets"]}
        for asset_id in ASSET_ORDER:
            asset = by_id[asset_id]
            rows = read_daily_open(args.price_root / f"{asset_id}.tsv")
            price = asset["metrics"]["price"]
            price["resolutions"] = build_resolutions(rows)
            price["available"] = True
            price.pop("unavailableReason", None)
            price["resolutionAvailability"] = {
                "daily": True,
                "weekly": True,
                "monthly": True,
                "yearly": True,
            }
            price["source"] = {
                "provider": "Li Blockchain",
                "dataset": "CMC original price data / tsv2026",
                "sourceFile": f"cmc_original_price_data/tsv2026/{asset_id}.tsv",
                "rawField": "Open*",
                "aggregation": "calendar-period arithmetic mean of daily Open",
                "licenseNote": "project-local research input",
                "availableWindow": {
                    "start": rows[0][0].isoformat(),
                    "end": rows[-1][0].isoformat(),
                },
                "observationCount": len(rows),
                "windowPolicy": "all project-available observations",
            }
            source_windows[asset_id] = price["source"]["availableWindow"]
            asset["events"] = read_events(archive, asset_id)

    by_id = {asset["id"]: asset for asset in payload["assets"]}
    payload["assets"] = [by_id[asset_id] for asset_id in ASSET_ORDER]
    payload["protocolVersion"] = "boundary-lab-modular-v4.1"
    payload["datasetVersion"] = "research-stimuli-modular-v8"
    payload["generatedAt"] = datetime.now(tz=timezone.utc).isoformat()
    payload["requestedWindow"] = {
        "start": min(window["start"] for window in source_windows.values()),
        "end": max(window["end"] for window in source_windows.values()),
    }
    payload["sourceWindows"] = source_windows
    payload["dataset"]["price"] = (
        "Li Blockchain CMC original daily Open; all available observations for six M1 assets"
    )
    payload["dataset"]["eventSetStatus"] = (
        "frozen events_20260527 source rows with original numeric priority and identifiers"
    )
    payload["dataset"]["eventSource"] = {
        "file": args.events_zip.name,
        "sha256": source_sha256(args.events_zip),
        "assets": list(ASSET_ORDER),
        "originalPriorityRange": [1, 5],
    }
    payload["modularProtocol"]["eventPriorityStatus"] = (
        "frozen source priority; DI3 uses 1-2, DI4 adds 3-5"
    )
    payload["modularProtocol"]["eventDisclosureProtocol"] = {
        "DI3": {"sourcePriorities": [1, 2], "maximumNewEvents": 10},
        "DI4": {"sourcePriorities": [3, 4, 5], "maximumNewEvents": 10},
        "overflowRule": "chronological even-spacing with endpoints, deterministic",
        "cumulative": True,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(args.output),
                "bytes": args.output.stat().st_size,
                "datasetVersion": payload["datasetVersion"],
                "assets": [
                    {
                        "id": asset["id"],
                        "events": len(asset["events"]),
                        "priceWindow": source_windows[asset["id"]],
                    }
                    for asset in payload["assets"]
                ],
                "eventSource": payload["dataset"]["eventSource"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
