"""Export the first experiment stimulus from the Li Blockchain dataset.

The source TSV is treated as read-only. Weekly values reproduce the project's
MATLAB/Python convention: sort daily observations ascending, then take the mean
Open price over consecutive seven-observation blocks anchored at the first
available date. The selected 2017-2024 window is rescaled only for display; raw
USD prices are retained for the later disclosure rounds.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from statistics import fmean


SOURCE_ROOT = Path(
    r"E:\Blockchain Matlab\code_LZ2022_transfer_20260810\code_LZ2022"
)
SOURCE_TSV = SOURCE_ROOT / "cmc_original_price_data" / "tsv2026" / "bitcoin.tsv"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "data" / "bitcoin-2017-2024.json"

WINDOW_START = datetime(2017, 1, 1)
WINDOW_END = datetime(2024, 12, 31)


def read_daily_open() -> list[tuple[datetime, float]]:
    rows: list[tuple[datetime, float]] = []
    with SOURCE_TSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter="\t")
        header = next(reader)
        open_index = next(
            index
            for index, name in enumerate(header)
            if name.strip().lower().startswith("open")
        )
        for row in reader:
            if not row:
                continue
            rows.append(
                (
                    datetime.strptime(row[0].strip(), "%b %d, %Y"),
                    float(row[open_index].strip()),
                )
            )
    rows.sort(key=lambda item: item[0])
    return rows


def weekly_blocks(
    rows: list[tuple[datetime, float]],
) -> list[tuple[datetime, datetime, float]]:
    usable = len(rows) - (len(rows) % 7)
    result: list[tuple[datetime, datetime, float]] = []
    for offset in range(0, usable, 7):
        block = rows[offset : offset + 7]
        result.append((block[0][0], block[-1][0], fmean(value for _, value in block)))
    return result


def main() -> None:
    all_daily = read_daily_open()
    all_weekly = weekly_blocks(all_daily)
    selected = [
        record
        for record in all_weekly
        if WINDOW_START <= record[0] and record[1] <= WINDOW_END
    ]
    maximum = max(price for _, _, price in selected)

    points = [
        {
            "index": index,
            "date": start.date().isoformat(),
            "weekEnd": end.date().isoformat(),
            "price": round(price, 6),
            "normalized": round(price / maximum, 8),
        }
        for index, (start, end, price) in enumerate(selected)
    ]

    # These are prototype annotations only. The final experiment must select and
    # word events through an independent, preregistered procedure and include
    # sham/misaligned controls.
    events = [
        {
            "date": "2017-12-17",
            "label": "CME Bitcoin 期货上线",
            "category": "market-infrastructure",
        },
        {
            "date": "2020-03-12",
            "label": "全球市场流动性冲击",
            "category": "macro",
        },
        {
            "date": "2020-05-11",
            "label": "第三次区块奖励减半",
            "category": "protocol",
        },
        {
            "date": "2021-09-07",
            "label": "萨尔瓦多法定货币政策生效",
            "category": "adoption",
        },
        {
            "date": "2022-05-12",
            "label": "Terra/LUNA 市场冲击",
            "category": "market-stress",
        },
        {
            "date": "2022-11-11",
            "label": "FTX 申请破产保护",
            "category": "market-stress",
        },
        {
            "date": "2024-01-10",
            "label": "美国现货 Bitcoin ETF 获批",
            "category": "regulation",
        },
        {
            "date": "2024-04-20",
            "label": "第四次区块奖励减半",
            "category": "protocol",
        },
    ]

    payload = {
        "id": "li-btc-weekly-2017-2024-v1",
        "protocolVersion": "context-elasticity-pilot-v1",
        "asset": {"name": "Bitcoin", "symbol": "BTC", "currency": "USD"},
        "source": {
            "project": "Li Blockchain",
            "sourceFile": "cmc_original_price_data/tsv2026/bitcoin.tsv",
            "frozenCohortCount": 678,
            "currentRuleValidCount": 993,
            "rawTsvCount": 1000,
            "aggregation": "Mean daily Open over consecutive 7-observation blocks",
            "window": {"start": points[0]["date"], "end": points[-1]["weekEnd"]},
            "displayNormalization": "weekly Open divided by maximum within displayed window",
        },
        "points": points,
        "events": events,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "points": len(points),
                "first": points[0],
                "last": points[-1],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
