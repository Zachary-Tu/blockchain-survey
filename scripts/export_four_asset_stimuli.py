"""Build the four-asset stimulus set for Boundary Lab v3.

The Li Blockchain TSV files are read-only inputs. Weekly values reproduce the
project convention: sort daily observations in ascending order and average
Open over consecutive seven-observation blocks anchored at each file's first
available date. All four experiment curves use the common 2020-08 through
2024-12 window. A second 2018-2026 context series locates that excerpt inside
the asset's longer available history; Solana starts at its actual first record.

Event labels are a traceable pilot set, not a preregistered causal annotation.
Formal data collection must freeze wording and selection independently.
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
TSV_ROOT = SOURCE_ROOT / "cmc_original_price_data" / "tsv2026"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "data" / "asset-stimuli-v2.json"

WINDOW_START = datetime(2020, 8, 1)
WINDOW_END = datetime(2024, 12, 31)
CONTEXT_START = datetime(2018, 1, 1)
CONTEXT_END = datetime(2026, 4, 11)

ASSETS = [
    {
        "slug": "bitcoin",
        "name": "Bitcoin",
        "nameZh": "比特币",
        "symbol": "BTC",
        "events": [
            ("2021-02-08", "特斯拉披露购入比特币", "adoption", "https://www.sec.gov/Archives/edgar/data/1318605/000156459021004599/tsla-10k_20201231.htm"),
            ("2021-09-07", "萨尔瓦多《比特币法》生效", "policy", "https://www.asamblea.gob.sv/sites/default/files/documents/decretos/27B1B3E5-28F0-486D-9A6F-8A4C6202B3E4.pdf"),
            ("2022-05-12", "Terra/LUNA 市场冲击", "market-stress", "https://agora.terra.money/t/terra-ecosystem-revival-plan-2-amended/18498"),
            ("2022-11-11", "FTX 申请破产保护", "market-stress", "https://www.prnewswire.com/news-releases/ftx-group-companies-commence-voluntary-chapter-11-proceedings-in-the-united-states-301675308.html"),
            ("2024-01-10", "美国现货比特币 ETP 获批", "regulation", "https://www.sec.gov/newsroom/speeches-statements/gensler-statement-spot-bitcoin-011023"),
            ("2024-04-20", "第四次区块奖励减半", "protocol", "https://mempool.space/block/0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5"),
        ],
    },
    {
        "slug": "ethereum",
        "name": "Ethereum",
        "nameZh": "以太坊",
        "symbol": "ETH",
        "events": [
            ("2020-12-01", "信标链启动", "protocol", "https://ethereum.org/roadmap/beacon-chain/"),
            ("2021-08-05", "London 升级（EIP-1559）", "protocol", "https://ethereum.org/ethereum-forks/"),
            ("2022-09-15", "The Merge 完成", "protocol", "https://ethereum.org/roadmap/merge/"),
            ("2023-04-12", "Shapella 升级", "protocol", "https://ethereum.org/roadmap/"),
            ("2024-03-13", "Dencun 升级", "protocol", "https://ethereum.org/roadmap/"),
            ("2024-07-23", "美国现货 Ether ETP 开始交易", "regulation", "https://www.sec.gov/Archives/edgar/data/1074828/000165495425009164/knwn_ex992.htm"),
        ],
    },
    {
        "slug": "solana",
        "name": "Solana",
        "nameZh": "Solana",
        "symbol": "SOL",
        "events": [
            ("2020-12-04", "主网 Beta 暂停出块", "network", "https://solana.com/news/mainnet-beta-stall---postmortem"),
            ("2021-09-14", "网络中断约 17 小时", "network", "https://solana.com/news/9-14-network-outage-initial-overview"),
            ("2022-06-01", "主网 Beta 网络中断", "network", "https://status.solana.com/incidents/j7w3z1hq6mjq"),
            ("2022-11-11", "FTX 申请破产保护", "market-stress", "https://www.prnewswire.com/news-releases/ftx-group-companies-commence-voluntary-chapter-11-proceedings-in-the-united-states-301675308.html"),
            ("2023-10-31", "Firedancer 测试网版本发布", "protocol", "https://solana.com/news/breakpoint-2023-day-1-firedancer-aws-google-cloud"),
            ("2024-02-06", "主网 Beta 网络中断", "network", "https://solana.com/news/02-06-24-solana-mainnet-beta-outage-report"),
        ],
    },
    {
        "slug": "bnb",
        "name": "BNB",
        "nameZh": "BNB",
        "symbol": "BNB",
        "events": [
            ("2020-09-01", "Binance Smart Chain 主网启动", "protocol", "https://www.bnbchain.org/en/blog/binance-awards-2021-bsc-project-of-the-year"),
            ("2021-10-12", "十亿美元生态增长基金公布", "ecosystem", "https://www.bnbchain.org/en/blog/binance-smart-chain-announces-1-billion-growth-fund"),
            ("2022-02-15", "BSC 更名为 BNB Chain", "ecosystem", "https://www.bnbchain.org/en/blog/bsc-is-now-bnb-chain-the-infrastructure-for-the-metafi-universe"),
            ("2022-10-06", "BSC Token Hub 跨链桥事件", "network", "https://www.bnbchain.org/en/blog/bnb-chain-a-decentralized-response"),
            ("2023-06-05", "美国 SEC 对 Binance 及其创始人提起诉讼", "regulation", "https://www.sec.gov/newsroom/press-releases/2023-101-sec-files-13-charges-against-binance-entities-founder-changpeng-zhao"),
            ("2023-11-21", "Binance 与创始人对美国联邦指控认罪", "regulation", "https://www.justice.gov/archives/opa/pr/binance-and-ceo-plead-guilty-federal-charges-4b-resolution"),
        ],
    },
]


def read_daily_open(path: Path) -> list[tuple[datetime, float]]:
    rows: list[tuple[datetime, float]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.reader(handle, delimiter="\t")
        header = next(reader)
        open_index = next(
            index
            for index, name in enumerate(header)
            if name.strip().lower().startswith("open")
        )
        for row in reader:
            if row:
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


def build_curve(asset: dict[str, object]) -> dict[str, object]:
    slug = str(asset["slug"])
    source_file = TSV_ROOT / f"{slug}.tsv"
    weekly = weekly_blocks(read_daily_open(source_file))
    selected = [
        record
        for record in weekly
        if WINDOW_START <= record[0] and record[1] <= WINDOW_END
    ]
    context = [
        record
        for record in weekly
        if CONTEXT_START <= record[0] and record[1] <= CONTEXT_END
    ]
    minimum = min(price for _, _, price in selected)
    maximum = max(price for _, _, price in selected)
    spread = maximum - minimum

    points = [
        {
            "index": index,
            "date": start.date().isoformat(),
            "weekEnd": end.date().isoformat(),
            "price": round(price, 6),
            "normalized": round((price - minimum) / spread, 8),
        }
        for index, (start, end, price) in enumerate(selected)
    ]
    context_minimum = min(price for _, _, price in context)
    context_maximum = max(price for _, _, price in context)
    context_spread = context_maximum - context_minimum
    context_points = [
        {
            "index": index,
            "date": start.date().isoformat(),
            "weekEnd": end.date().isoformat(),
            "price": round(price, 6),
            "normalized": round((price - context_minimum) / context_spread, 8),
        }
        for index, (start, end, price) in enumerate(context)
    ]
    events = [
        {
            "date": date,
            "label": label,
            "category": category,
            "sourceUrl": source_url,
        }
        for date, label, category, source_url in asset["events"]  # type: ignore[index]
    ]

    return {
        "id": f"li-{str(asset['symbol']).lower()}-weekly-2020-2024-v3",
        "asset": {
            "name": asset["name"],
            "nameZh": asset["nameZh"],
            "symbol": asset["symbol"],
            "currency": "USD",
        },
        "source": {
            "project": "Li Blockchain",
            "sourceFile": f"cmc_original_price_data/tsv2026/{slug}.tsv",
            "aggregation": "Mean daily Open over consecutive 7-observation blocks",
            "window": {"start": points[0]["date"], "end": points[-1]["weekEnd"]},
            "contextWindow": {
                "start": context_points[0]["date"],
                "end": context_points[-1]["weekEnd"],
            },
            "priceMin": round(minimum, 6),
            "priceMax": round(maximum, 6),
            "displayNormalization": "min-max within each displayed window",
        },
        "points": points,
        "contextPoints": context_points,
        "events": events,
    }


def main() -> None:
    curves = [build_curve(asset) for asset in ASSETS]
    payload = {
        "protocolVersion": "context-elasticity-four-asset-v3",
        "dataset": {
            "project": "Li Blockchain",
            "frozenCohortCount": 678,
            "currentRuleValidCount": 993,
            "rawTsvCount": 1000,
            "pilotCurveCount": len(curves),
            "eventSetStatus": "traceable pilot annotations; independent preregistration required",
        },
        "curves": curves,
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
                "curves": [
                    {
                        "symbol": curve["asset"]["symbol"],  # type: ignore[index]
                        "points": len(curve["points"]),  # type: ignore[arg-type]
                        "contextPoints": len(curve["contextPoints"]),  # type: ignore[arg-type]
                        "first": curve["points"][0],  # type: ignore[index]
                        "last": curve["points"][-1],  # type: ignore[index]
                        "events": len(curve["events"]),  # type: ignore[arg-type]
                    }
                    for curve in curves
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
