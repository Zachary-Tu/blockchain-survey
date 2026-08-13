"""Build the frozen stimulus bundle for the modular Boundary Lab protocol.

The crypto observations and traceable event annotations are inherited unchanged
from v5.  This script adds pilot event-priority codes and three control series:
an S&P 500 cross-domain control, a seeded white-noise null control, and a seeded
synthetic regime series with known change points.
"""

from __future__ import annotations

import csv
import io
import json
import math
import random
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "public" / "data" / "research-stimuli-v5.json"
OUTPUT = ROOT / "public" / "data" / "research-stimuli-modular-v6.json"
WINDOW_START = date(2018, 1, 1)
WINDOW_END = date(2026, 4, 11)
RESOLUTIONS = ("daily", "weekly", "monthly", "yearly")


HIGH_PRIORITY_TITLES = {
    "第三次区块奖励减半",
    "FTX 申请破产保护",
    "美国现货比特币 ETP 获批",
    "第四次区块奖励减半",
    "信标链启动",
    "The Merge 完成",
    "美国现货 Ether ETP 开始交易",
    "网络中断约 17 小时",
    "主网 Beta 网络中断",
    "Binance Smart Chain 主网启动",
    "BSC Token Hub 跨链桥事件",
    "美国 SEC 起诉 Binance 相关实体",
    "Binance 与创始人对美国联邦指控认罪",
}


def period_key(observed: date, resolution: str) -> tuple[int, ...]:
    if resolution == "weekly":
        monday = observed - timedelta(days=observed.weekday())
        return monday.year, monday.month, monday.day
    if resolution == "monthly":
        return observed.year, observed.month
    if resolution == "yearly":
        return (observed.year,)
    return observed.year, observed.month, observed.day


def aggregate(rows: list[tuple[date, float]], resolution: str) -> list[tuple[date, float]]:
    if resolution == "daily":
        return rows
    buckets: dict[tuple[int, ...], list[tuple[date, float]]] = defaultdict(list)
    for observed, value in rows:
        buckets[period_key(observed, resolution)].append((observed, value))
    return [
        (values[0][0], statistics.fmean(value for _, value in values))
        for _, values in sorted(buckets.items())
    ]


def compact(rows: list[tuple[date, float]]) -> list[dict[str, object]]:
    return [
        {"date": observed.isoformat(), "value": round(value, 6)}
        for observed, value in rows
    ]


def reference_by_count(length: int) -> dict[str, list[float]]:
    # Controls use neutral equal-width proposals. They are UI starting/reference
    # positions only and are never presented as known true boundaries.
    return {
        str(count): [round(index / (count + 1), 6) for index in range(1, count + 1)]
        for count in (1, 2, 3)
    }


def resolution_payload(rows: list[tuple[date, float]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for resolution in RESOLUTIONS:
        grouped = aggregate(rows, resolution)
        references = reference_by_count(len(grouped))
        result[resolution] = {
            "points": compact(grouped),
            "referenceBoundaries": references["2"],
            "referenceBoundariesByCount": references,
        }
    return result


def fetch_sp500() -> list[tuple[date, float]]:
    response = requests.get(
        "https://fred.stlouisfed.org/graph/fredgraph.csv",
        params={
            "id": "SP500",
            "cosd": WINDOW_START.isoformat(),
            "coed": WINDOW_END.isoformat(),
        },
        timeout=60,
    )
    response.raise_for_status()
    rows: list[tuple[date, float]] = []
    for item in csv.DictReader(io.StringIO(response.text)):
        value = item.get("SP500", ".")
        if value in (None, "", "."):
            continue
        observed = date.fromisoformat(item["observation_date"])
        if WINDOW_START <= observed <= WINDOW_END:
            rows.append((observed, float(value)))
    if len(rows) < 1500:
        raise RuntimeError("FRED SP500 series returned too few observations")
    return rows


def calendar_days() -> list[date]:
    result: list[date] = []
    observed = WINDOW_START
    while observed <= WINDOW_END:
        result.append(observed)
        observed += timedelta(days=1)
    return result


def white_noise() -> list[tuple[date, float]]:
    rng = random.Random(20260813)
    return [(observed, 100 + rng.gauss(0, 8)) for observed in calendar_days()]


def synthetic_regimes() -> tuple[list[tuple[date, float]], list[str]]:
    rng = random.Random(20260814)
    first = date(2020, 7, 1)
    second = date(2023, 3, 1)
    rows: list[tuple[date, float]] = []
    value = 42.0
    for observed in calendar_days():
        if observed < first:
            drift, noise, anchor = 0.006, 0.42, 48
        elif observed < second:
            drift, noise, anchor = 0.042, 1.7, 150
        else:
            drift, noise, anchor = -0.012, 0.8, 112
        value += drift + (anchor - value) * 0.0018 + rng.gauss(0, noise)
        value = max(2.0, value)
        rows.append((observed, value))
    return rows, [first.isoformat(), second.isoformat()]


def control_payload(
    *,
    control_id: str,
    kind: str,
    name: str,
    name_zh: str,
    intro: str,
    rows: list[tuple[date, float]],
    source: dict[str, object],
    known_boundaries: list[str] | None = None,
) -> dict[str, object]:
    return {
        "id": control_id,
        "kind": kind,
        "name": name,
        "nameZh": name_zh,
        "symbol": control_id.upper(),
        "intro": intro,
        "metric": {
            "key": "price",
            "name": "指数水平" if control_id == "sp500" else "控制序列数值",
            "unit": "index points" if control_id == "sp500" else "arbitrary units",
            "definition": "用于识别跨领域迁移或虚假阶段感知的研究控制序列。",
            "resolutions": resolution_payload(rows),
        },
        "source": source,
        "knownBoundaries": known_boundaries or [],
        "events": [],
    }


def main() -> None:
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    for asset in payload["assets"]:
        for event in asset["events"]:
            event["priority"] = (
                "high" if event["title"] in HIGH_PRIORITY_TITLES else "low"
            )
            event["priorityProtocol"] = "pilot-independent-rule-v1"

    sp500_rows = fetch_sp500()
    synthetic_rows, known_boundaries = synthetic_regimes()
    payload["controls"] = [
        control_payload(
            control_id="sp500",
            kind="cross-domain",
            name="S&P 500",
            name_zh="S&P 500 市场指数",
            intro="美国大盘股票市场的跨领域控制，用于检验阶段判断是否只在加密资产语境中出现。",
            rows=sp500_rows,
            source={
                "provider": "Federal Reserve Bank of St. Louis, FRED",
                "seriesId": "SP500",
                "url": "https://fred.stlouisfed.org/series/SP500",
                "nativeFrequency": "daily, close",
                "frozenAt": datetime.now(tz=timezone.utc).isoformat(),
            },
        ),
        control_payload(
            control_id="white-noise",
            kind="null",
            name="Seeded white noise",
            name_zh="白噪声负对照",
            intro="没有预设阶段结构的确定性随机序列，用于测量测试者在无阶段数据中制造阶段的倾向。",
            rows=white_noise(),
            source={
                "generator": "Python random.Random Gaussian",
                "seed": 20260813,
                "mean": 100,
                "standardDeviation": 8,
            },
        ),
        control_payload(
            control_id="synthetic-regime",
            kind="ground-truth",
            name="Synthetic regime series",
            name_zh="合成变点正对照",
            intro="包含两个预先写入的状态变化点，用于估计边界识别误差和不确定区间覆盖率。",
            rows=synthetic_rows,
            source={
                "generator": "seeded mean-reverting regime process",
                "seed": 20260814,
                "groundTruthHiddenFromParticipant": True,
            },
            known_boundaries=known_boundaries,
        ),
    ]
    payload["protocolVersion"] = "boundary-lab-modular-v6"
    payload["generatedAt"] = datetime.now(tz=timezone.utc).isoformat()
    payload["modularProtocol"] = {
        "taskTypes": ["T1", "T2", "T3"],
        "disclosurePackets": [
            "G0",
            "GI1",
            "GI2",
            "DI1",
            "DI2",
            "DI3",
            "DI4",
            "FULL",
        ],
        "eventPriorityStatus": "pilot coding; independently recode and preregister before confirmatory collection",
        "controlTaxonomy": {
            "sp500": "cross-domain control",
            "white-noise": "null control",
            "synthetic-regime": "ground-truth positive control",
        },
    }
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "bytes": OUTPUT.stat().st_size,
                "sp500Daily": len(sp500_rows),
                "controls": [control["id"] for control in payload["controls"]],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
