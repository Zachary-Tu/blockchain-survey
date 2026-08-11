"""Build the research stimulus bundle used by Boundary Lab v4.

The bundle intentionally keeps source provenance next to every metric. Price
data come from the Li Blockchain CMC TSV archive. Active-address observations
come from Coin Metrics Community API and are included only when the public
endpoint supplies a continuous, methodologically compatible series. Google
Trends observations use Google Trends topics and a documented overlap/anchor
calibration because the public Explore interface normalizes every request.

Nothing in this script fills unavailable observations with synthetic values.
That is especially important for SOL and BNB Smart Chain active addresses:
their Coin Metrics catalog entries require credentials that are not available
to this project, so those two cells remain explicitly unavailable.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

import requests


SOURCE_ROOT = Path(
    r"E:\Blockchain Matlab\code_LZ2022_transfer_20260810\code_LZ2022"
)
TSV_ROOT = SOURCE_ROOT / "cmc_original_price_data" / "tsv2026"
OUTPUT = (
    Path(__file__).resolve().parents[1]
    / "public"
    / "data"
    / "research-stimuli-v4.json"
)
CACHE_ROOT = Path(__file__).resolve().parents[1] / "work" / "research-data-cache"

WINDOW_START = date(2018, 1, 1)
WINDOW_END = date(2026, 4, 11)
RESOLUTIONS = ("daily", "weekly", "monthly", "yearly")


ASSETS = [
    {
        "slug": "bitcoin",
        "coinMetricsAsset": "btc",
        "name": "Bitcoin",
        "nameZh": "比特币",
        "symbol": "BTC",
        "trendTopic": "/m/05p0rrx",
        "trendTopicLabel": "Bitcoin · Cryptocurrency",
        "intro": "Bitcoin 是 2009 年上线的点对点价值转移网络，其原生资产 BTC 按预定的发行规则产生，并通过工作量证明维护账本。",
        "events": [
            (
                "2020-05-11",
                "第三次区块奖励减半",
                "区块补贴由 12.5 BTC 降至 6.25 BTC。",
                "protocol",
                "https://mempool.space/block/000000000000000000024bead8df69990852c202db0b1f31a52f2f4a3b1d6c31",
            ),
            (
                "2021-02-08",
                "特斯拉披露购入比特币",
                "特斯拉在年度报告中披露已购入约 15 亿美元比特币。",
                "adoption",
                "https://www.sec.gov/Archives/edgar/data/1318605/000156459021004599/tsla-10k_20201231.htm",
            ),
            (
                "2021-09-07",
                "萨尔瓦多《比特币法》生效",
                "该法律使比特币在萨尔瓦多获得法定货币地位。",
                "policy",
                "https://www.asamblea.gob.sv/sites/default/files/documents/decretos/27B1B3E5-28F0-486D-9A6F-8A4C6202B3E4.pdf",
            ),
            (
                "2022-05-12",
                "Terra / LUNA 市场冲击",
                "Terra 生态危机引发加密市场范围更广的去杠杆。",
                "market-stress",
                "https://agora.terra.money/t/terra-ecosystem-revival-plan-2-amended/18498",
            ),
            (
                "2022-11-11",
                "FTX 申请破产保护",
                "FTX 集团在美国启动 Chapter 11 破产程序。",
                "market-stress",
                "https://www.prnewswire.com/news-releases/ftx-group-companies-commence-voluntary-chapter-11-proceedings-in-the-united-states-301675308.html",
            ),
            (
                "2024-01-10",
                "美国现货比特币 ETP 获批",
                "美国 SEC 批准多只现货比特币交易所交易产品。",
                "regulation",
                "https://www.sec.gov/newsroom/speeches-statements/gensler-statement-spot-bitcoin-011023",
            ),
            (
                "2024-04-20",
                "第四次区块奖励减半",
                "区块补贴由 6.25 BTC 降至 3.125 BTC。",
                "protocol",
                "https://mempool.space/block/0000000000000000000320283a032748cef8227873ff4872689bf23f1cda83a5",
            ),
        ],
    },
    {
        "slug": "ethereum",
        "coinMetricsAsset": "eth",
        "name": "Ethereum",
        "nameZh": "以太坊",
        "symbol": "ETH",
        "trendTopic": "/m/0108bn2x",
        "trendTopicLabel": "Ethereum · Software",
        "intro": "Ethereum 是 2015 年上线的通用智能合约网络，ETH 用于支付网络费用并参与权益证明共识。",
        "events": [
            (
                "2020-12-01",
                "信标链启动",
                "Ethereum 权益证明路线的信标链正式启动。",
                "protocol",
                "https://ethereum.org/roadmap/beacon-chain/",
            ),
            (
                "2021-08-05",
                "London 升级（EIP-1559）",
                "升级引入基础费用销毁与新的手续费机制。",
                "protocol",
                "https://ethereum.org/ethereum-forks/",
            ),
            (
                "2022-09-15",
                "The Merge 完成",
                "Ethereum 主网共识由工作量证明切换为权益证明。",
                "protocol",
                "https://ethereum.org/roadmap/merge/",
            ),
            (
                "2023-04-12",
                "Shapella 升级",
                "升级开放信标链质押 ETH 的提款功能。",
                "protocol",
                "https://ethereum.org/roadmap/",
            ),
            (
                "2024-03-13",
                "Dencun 升级",
                "升级引入 blob 数据空间，以降低部分二层网络的数据成本。",
                "protocol",
                "https://ethereum.org/roadmap/",
            ),
            (
                "2024-07-23",
                "美国现货 Ether ETP 开始交易",
                "多只美国现货 Ether 交易所交易产品开始上市交易。",
                "regulation",
                "https://www.sec.gov/Archives/edgar/data/1074828/000165495425009164/knwn_ex992.htm",
            ),
        ],
    },
    {
        "slug": "solana",
        "coinMetricsAsset": None,
        "name": "Solana",
        "nameZh": "Solana",
        "symbol": "SOL",
        "trendTopic": "/g/11qh5y640t",
        "trendTopicLabel": "Solana · Blockchain platform",
        "intro": "Solana 是 2020 年上线的智能合约网络，采用权益证明与历史证明相关机制，强调高吞吐量和较低交易成本。",
        "events": [
            (
                "2020-12-04",
                "主网 Beta 暂停出块",
                "网络停止确认新区块，验证者协调恢复运行。",
                "network",
                "https://solana.com/news/mainnet-beta-stall---postmortem",
            ),
            (
                "2021-09-14",
                "网络中断约 17 小时",
                "交易负载导致网络停止推进，随后通过协调重启恢复。",
                "network",
                "https://solana.com/news/9-14-network-outage-initial-overview",
            ),
            (
                "2022-06-01",
                "主网 Beta 网络中断",
                "持久 nonce 交易处理问题导致网络暂停。",
                "network",
                "https://status.solana.com/incidents/j7w3z1hq6mjq",
            ),
            (
                "2022-11-11",
                "FTX 申请破产保护",
                "FTX 破产使与其关系密切的 Solana 生态面临市场压力。",
                "market-stress",
                "https://www.prnewswire.com/news-releases/ftx-group-companies-commence-voluntary-chapter-11-proceedings-in-the-united-states-301675308.html",
            ),
            (
                "2023-10-31",
                "Firedancer 测试网版本发布",
                "新的独立验证者客户端在测试环境中公开亮相。",
                "protocol",
                "https://solana.com/news/breakpoint-2023-day-1-firedancer-aws-google-cloud",
            ),
            (
                "2024-02-06",
                "主网 Beta 网络中断",
                "网络因编译缓存相关软件缺陷停止出块并完成重启。",
                "network",
                "https://solana.com/news/02-06-24-solana-mainnet-beta-outage-report",
            ),
        ],
    },
    {
        "slug": "bnb",
        "coinMetricsAsset": None,
        "name": "BNB",
        "nameZh": "BNB",
        "symbol": "BNB",
        "trendTopic": "/g/11fv0mv90t",
        "trendTopicLabel": "BNB · Topic",
        "intro": "BNB 是 Binance 生态与 BNB Chain 使用的原生资产，可用于网络手续费、质押及生态内的其他用途。",
        "events": [
            (
                "2020-09-01",
                "Binance Smart Chain 主网启动",
                "兼容 EVM 的 Binance Smart Chain 开始运行。",
                "protocol",
                "https://www.bnbchain.org/en/blog/binance-awards-2021-bsc-project-of-the-year",
            ),
            (
                "2021-10-12",
                "十亿美元生态增长基金公布",
                "生态方公布用于项目发展和采用计划的增长基金。",
                "ecosystem",
                "https://www.bnbchain.org/en/blog/binance-smart-chain-announces-1-billion-growth-fund",
            ),
            (
                "2022-02-15",
                "BSC 更名为 BNB Chain",
                "生态将 Binance Smart Chain 品牌调整为 BNB Chain。",
                "ecosystem",
                "https://www.bnbchain.org/en/blog/bsc-is-now-bnb-chain-the-infrastructure-for-the-metafi-universe",
            ),
            (
                "2022-10-06",
                "BSC Token Hub 跨链桥事件",
                "跨链桥漏洞导致异常增发，网络验证者随后暂停链上活动。",
                "network",
                "https://www.bnbchain.org/en/blog/bnb-chain-a-decentralized-response",
            ),
            (
                "2023-06-05",
                "美国 SEC 起诉 Binance 相关实体",
                "美国 SEC 对 Binance 相关实体及其创始人提起民事诉讼。",
                "regulation",
                "https://www.sec.gov/newsroom/press-releases/2023-101-sec-files-13-charges-against-binance-entities-founder-changpeng-zhao",
            ),
            (
                "2023-11-21",
                "Binance 与创始人对美国联邦指控认罪",
                "Binance 与其创始人分别就美国联邦指控达成认罪安排。",
                "regulation",
                "https://www.justice.gov/archives/opa/pr/binance-and-ceo-plead-guilty-federal-charges-4b-resolution",
            ),
        ],
    },
]


METRIC_COPY = {
    "price": {
        "name": "价格",
        "shortName": "价格数据",
        "unit": "USD",
        "definition": "每个日历区间内的美元开盘价均值；日频直接使用当日 Open。",
    },
    "activeAddresses": {
        "name": "活跃地址数",
        "shortName": "Active addresses",
        "unit": "个地址",
        "definition": "在一个自然日内作为账本变更发起方或接收方出现的唯一地址数。周、月、年分辨率显示日活地址数的区间均值，并非区间去重地址数。",
    },
    "googleTrends": {
        "name": "Google 搜索热度",
        "shortName": "Google Trends index",
        "unit": "相对热度指数",
        "definition": "全球 Google 网页搜索中的相对关注度。数值是抽样并标准化后的指数，不代表绝对搜索次数。",
    },
}


def iso_day(value: date) -> str:
    return value.isoformat()


def daterange(start: date, end: date) -> Iterable[date]:
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def read_daily_open(path: Path) -> list[tuple[date, float]]:
    rows: list[tuple[date, float]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
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
            observed = datetime.strptime(row[0].strip(), "%b %d, %Y").date()
            if WINDOW_START <= observed <= WINDOW_END:
                rows.append((observed, float(row[open_index].strip())))
    rows.sort(key=lambda item: item[0])
    return rows


def period_key(observed: date, resolution: str) -> tuple[int, ...]:
    if resolution == "weekly":
        monday = observed - timedelta(days=observed.weekday())
        return (monday.year, monday.month, monday.day)
    if resolution == "monthly":
        return (observed.year, observed.month)
    if resolution == "yearly":
        return (observed.year,)
    return (observed.year, observed.month, observed.day)


def aggregate(
    rows: list[tuple[date, float]], resolution: str
) -> list[tuple[date, float]]:
    if resolution == "daily":
        return rows
    buckets: dict[tuple[int, ...], list[tuple[date, float]]] = defaultdict(list)
    for observed, value in rows:
        buckets[period_key(observed, resolution)].append((observed, value))
    return [
        (values[0][0], statistics.fmean(value for _, value in values))
        for _, values in sorted(buckets.items())
    ]


def compact_points(rows: list[tuple[date, float]]) -> list[dict[str, object]]:
    return [
        {"date": iso_day(observed), "value": round(value, 6)}
        for observed, value in rows
    ]


def normalize(values: list[float]) -> list[float]:
    low = min(values)
    high = max(values)
    if math.isclose(low, high):
        return [0.5] * len(values)
    return [(value - low) / (high - low) for value in values]


def reference_boundaries(rows: list[tuple[date, float]]) -> list[float]:
    """Return two deterministic SSE-optimal boundary ratios.

    Daily series are sampled to at most 240 points before the dynamic search.
    The result is a neutral reference proposal for the evaluation task, never
    a claim that an objectively correct segmentation exists.
    """

    if len(rows) < 7:
        return [1 / 3, 2 / 3]
    source_values = normalize([math.log1p(value) for _, value in rows])
    sample_count = min(240, len(source_values))
    sampled = [
        source_values[round(index * (len(source_values) - 1) / (sample_count - 1))]
        for index in range(sample_count)
    ]
    prefix = [0.0]
    prefix_sq = [0.0]
    for value in sampled:
        prefix.append(prefix[-1] + value)
        prefix_sq.append(prefix_sq[-1] + value * value)

    def sse(start: int, end: int) -> float:
        count = end - start
        total = prefix[end] - prefix[start]
        total_sq = prefix_sq[end] - prefix_sq[start]
        return total_sq - total * total / count

    minimum = max(2, sample_count // 10)
    best = (float("inf"), sample_count // 3, 2 * sample_count // 3)
    for first in range(minimum, sample_count - 2 * minimum + 1):
        first_cost = sse(0, first)
        for second in range(first + minimum, sample_count - minimum + 1):
            cost = first_cost + sse(first, second) + sse(second, sample_count)
            if cost < best[0]:
                best = (cost, first, second)
    return [round(best[1] / (sample_count - 1), 6), round(best[2] / (sample_count - 1), 6)]


def build_resolutions(rows: list[tuple[date, float]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for resolution in RESOLUTIONS:
        grouped = aggregate(rows, resolution)
        result[resolution] = {
            "points": compact_points(grouped),
            "referenceBoundaries": reference_boundaries(grouped),
        }
    return result


def build_selected_resolutions(
    rows: list[tuple[date, float]], resolutions: tuple[str, ...]
) -> dict[str, object]:
    result: dict[str, object] = {}
    for resolution in resolutions:
        grouped = aggregate(rows, resolution)
        result[resolution] = {
            "points": compact_points(grouped),
            "referenceBoundaries": reference_boundaries(grouped),
        }
    return result


def request_json(
    session: requests.Session,
    url: str,
    *,
    params: dict[str, str] | None = None,
    referer: str | None = None,
    attempts: int = 7,
) -> dict[str, object]:
    headers = {"Referer": referer} if referer else None
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            response = session.get(url, params=params, headers=headers, timeout=45)
            if response.status_code == 429:
                last_error = RuntimeError("Google Trends returned HTTP 429")
                time.sleep(4 + attempt * 4)
                continue
            response.raise_for_status()
            text = response.text
            if text.startswith(")]}'"):
                text = text.split("\n", 1)[1]
            return json.loads(text)
        except (requests.RequestException, json.JSONDecodeError) as error:
            last_error = error
            time.sleep(1 + attempt * 2)
    raise RuntimeError(f"Unable to fetch {url}: {last_error}")


def trends_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    # The first response can be a rate-limit page while still issuing the NID
    # cookie required by subsequent Explore API calls. Network proxies can also
    # reset this warm-up request, so it is deliberately best-effort.
    for attempt in range(4):
        try:
            session.get("https://trends.google.com/trends/explore", timeout=45)
            break
        except requests.RequestException:
            if attempt == 3:
                raise
            time.sleep(2 + attempt * 2)
    return session


def fetch_trends_window(
    session: requests.Session, topic: str, start: date, end: date
) -> list[tuple[date, float]]:
    timeframe = f"{start.isoformat()} {end.isoformat()}"
    explore_request = {
        "comparisonItem": [{"keyword": topic, "geo": "", "time": timeframe}],
        "category": 0,
        "property": "",
    }
    explore = request_json(
        session,
        "https://trends.google.com/trends/api/explore",
        params={
            "hl": "en-US",
            "tz": "0",
            "req": json.dumps(explore_request, separators=(",", ":")),
        },
        referer="https://trends.google.com/trends/explore",
    )
    widgets = explore.get("widgets", [])
    widget = next(
        item
        for item in widgets
        if isinstance(item, dict) and item.get("id") == "TIMESERIES"
    )
    payload = request_json(
        session,
        "https://trends.google.com/trends/api/widgetdata/multiline",
        params={
            "hl": "en-US",
            "tz": "0",
            "req": json.dumps(widget["request"], separators=(",", ":")),
            "token": str(widget["token"]),
        },
        referer="https://trends.google.com/trends/explore",
    )
    timeline = payload.get("default", {}).get("timelineData", [])  # type: ignore[union-attr]
    result: list[tuple[date, float]] = []
    for item in timeline:
        observed = datetime.fromtimestamp(
            int(item["time"]), tz=timezone.utc
        ).date()
        result.append((observed, float(item["value"][0])))
    return result


def monthly_map(rows: list[tuple[date, float]]) -> dict[tuple[int, int], float]:
    return {(observed.year, observed.month): value for observed, value in rows}


def fetch_trends_daily(asset: dict[str, object], refresh: bool) -> list[tuple[date, float]]:
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_ROOT / f"trends-{asset['slug']}-daily.json"
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        return [(date.fromisoformat(row[0]), float(row[1])) for row in cached]

    topic = str(asset["trendTopic"])
    anchor_cache = CACHE_ROOT / f"trends-{asset['slug']}-monthly-anchor.json"
    if anchor_cache.exists() and not refresh:
        anchor_data = json.loads(anchor_cache.read_text(encoding="utf-8"))
        anchor_rows = [(date.fromisoformat(row[0]), float(row[1])) for row in anchor_data]
    else:
        print(f"Google Trends: fetching monthly anchor for {asset['symbol']}...", flush=True)
        anchor_rows = fetch_trends_window(
            trends_session(), topic, WINDOW_START, WINDOW_END
        )
        anchor_cache.write_text(
            json.dumps(
                [[observed.isoformat(), value] for observed, value in anchor_rows],
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )
    anchor = monthly_map(anchor_rows)

    chunk_days = 245
    overlap_days = 45
    windows: list[tuple[date, date]] = []
    cursor = WINDOW_START
    while cursor <= WINDOW_END:
        chunk_end = min(cursor + timedelta(days=chunk_days - 1), WINDOW_END)
        windows.append((cursor, chunk_end))
        if chunk_end == WINDOW_END:
            break
        cursor = chunk_end - timedelta(days=overlap_days - 1)

    merged: dict[date, list[float]] = defaultdict(list)
    for number, (start, end) in enumerate(windows, 1):
        window_cache = (
            CACHE_ROOT
            / f"trends-{asset['slug']}-{start.isoformat()}-{end.isoformat()}.json"
        )
        if window_cache.exists() and not refresh:
            window_data = json.loads(window_cache.read_text(encoding="utf-8"))
            daily = [
                (date.fromisoformat(row[0]), float(row[1])) for row in window_data
            ]
        else:
            print(
                f"Google Trends: {asset['symbol']} daily window {number}/{len(windows)} {start}..{end}",
                flush=True,
            )
            daily = fetch_trends_window(trends_session(), topic, start, end)
            window_cache.write_text(
                json.dumps(
                    [[observed.isoformat(), value] for observed, value in daily],
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )
        month_values: dict[tuple[int, int], list[float]] = defaultdict(list)
        for observed, value in daily:
            month_values[(observed.year, observed.month)].append(value)
        ratios: list[float] = []
        for key, values in month_values.items():
            # Partial edge months are omitted from calibration.
            if len(values) < 20:
                continue
            local_mean = statistics.fmean(values)
            anchor_value = anchor.get(key, 0)
            if local_mean > 0 and anchor_value > 0:
                ratios.append(anchor_value / local_mean)
        scale = statistics.median(ratios) if ratios else 1.0
        for observed, value in daily:
            merged[observed].append(value * scale)
        time.sleep(1.5)

    stitched = [
        (observed, statistics.fmean(values))
        for observed, values in sorted(merged.items())
        if WINDOW_START <= observed <= WINDOW_END
    ]
    maximum = max(value for _, value in stitched) or 1.0
    normalized = [(observed, value / maximum * 100) for observed, value in stitched]
    cache_path.write_text(
        json.dumps(
            [[observed.isoformat(), round(value, 6)] for observed, value in normalized],
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return normalized


def fetch_trends_weekly(asset: dict[str, object], refresh: bool) -> list[tuple[date, float]]:
    """Fetch the native weekly resolution available for multi-year windows.

    Two overlapping requests cover 2018-2026. Each request is anchored to one
    full-range monthly series before the shared weeks are averaged. This avoids
    presenting interpolated or repeatedly re-normalized daily values as if they
    were native Google Trends observations.
    """

    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_ROOT / f"trends-{asset['slug']}-weekly.json"
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        return [(date.fromisoformat(row[0]), float(row[1])) for row in cached]

    topic = str(asset["trendTopic"])
    anchor_cache = CACHE_ROOT / f"trends-{asset['slug']}-monthly-anchor.json"
    if anchor_cache.exists() and not refresh:
        anchor_data = json.loads(anchor_cache.read_text(encoding="utf-8"))
        anchor_rows = [(date.fromisoformat(row[0]), float(row[1])) for row in anchor_data]
    else:
        print(f"Google Trends: fetching monthly anchor for {asset['symbol']}...", flush=True)
        anchor_rows = fetch_trends_window(
            trends_session(), topic, WINDOW_START, WINDOW_END
        )
        anchor_cache.write_text(
            json.dumps(
                [[observed.isoformat(), value] for observed, value in anchor_rows],
                separators=(",", ":"),
            )
            + "\n",
            encoding="utf-8",
        )
    anchor = monthly_map(anchor_rows)

    windows = [
        (WINDOW_START, date(2022, 12, 31)),
        (date(2022, 1, 1), WINDOW_END),
    ]
    merged: dict[date, list[float]] = defaultdict(list)
    for number, (start, end) in enumerate(windows, 1):
        window_cache = (
            CACHE_ROOT
            / f"trends-{asset['slug']}-weekly-{start.isoformat()}-{end.isoformat()}.json"
        )
        if window_cache.exists() and not refresh:
            window_data = json.loads(window_cache.read_text(encoding="utf-8"))
            weekly = [
                (date.fromisoformat(row[0]), float(row[1])) for row in window_data
            ]
        else:
            print(
                f"Google Trends: {asset['symbol']} weekly window {number}/{len(windows)} {start}..{end}",
                flush=True,
            )
            weekly = fetch_trends_window(trends_session(), topic, start, end)
            window_cache.write_text(
                json.dumps(
                    [[observed.isoformat(), value] for observed, value in weekly],
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )

        month_values: dict[tuple[int, int], list[float]] = defaultdict(list)
        for observed, value in weekly:
            month_values[(observed.year, observed.month)].append(value)
        ratios: list[float] = []
        for key, values in month_values.items():
            if len(values) < 3:
                continue
            local_mean = statistics.fmean(values)
            anchor_value = anchor.get(key, 0)
            if local_mean > 0 and anchor_value > 0:
                ratios.append(anchor_value / local_mean)
        scale = statistics.median(ratios) if ratios else 1.0
        for observed, value in weekly:
            if WINDOW_START <= observed <= WINDOW_END:
                merged[observed].append(value * scale)
        time.sleep(1.5)

    stitched = [
        (observed, statistics.fmean(values))
        for observed, values in sorted(merged.items())
    ]
    maximum = max(value for _, value in stitched) or 1.0
    normalized = [(observed, value / maximum * 100) for observed, value in stitched]
    cache_path.write_text(
        json.dumps(
            [[observed.isoformat(), round(value, 6)] for observed, value in normalized],
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return normalized


def fetch_active_addresses(
    asset: dict[str, object], refresh: bool
) -> list[tuple[date, float]] | None:
    coinmetrics_asset = asset.get("coinMetricsAsset")
    if not coinmetrics_asset:
        return None
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_ROOT / f"coinmetrics-{coinmetrics_asset}-AdrActCnt.json"
    if cache_path.exists() and not refresh:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        return [(date.fromisoformat(row[0]), float(row[1])) for row in cached]
    response = requests.get(
        "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics",
        params={
            "assets": coinmetrics_asset,
            "metrics": "AdrActCnt",
            "frequency": "1d",
            "start_time": WINDOW_START.isoformat(),
            "end_time": WINDOW_END.isoformat(),
            "page_size": "10000",
        },
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    rows = [
        (
            datetime.fromisoformat(item["time"].replace("Z", "+00:00")).date(),
            float(item["AdrActCnt"]),
        )
        for item in payload["data"]
        if item.get("AdrActCnt") not in (None, "")
    ]
    rows.sort(key=lambda item: item[0])
    cache_path.write_text(
        json.dumps(
            [[observed.isoformat(), value] for observed, value in rows],
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return rows


def metric_payload(
    key: str,
    rows: list[tuple[date, float]] | None,
    source: dict[str, object],
    unavailable_reason: str | None = None,
    resolutions: tuple[str, ...] = RESOLUTIONS,
) -> dict[str, object]:
    copy = METRIC_COPY[key]
    if not rows:
        return {
            **copy,
            "available": False,
            "source": source,
            "unavailableReason": unavailable_reason,
            "resolutions": {},
        }
    return {
        **copy,
        "available": True,
        "source": {
            **source,
            "availableWindow": {
                "start": rows[0][0].isoformat(),
                "end": rows[-1][0].isoformat(),
            },
            "observationCount": len(rows),
        },
        "resolutionAvailability": {
            resolution: resolution in resolutions for resolution in RESOLUTIONS
        },
        "resolutions": build_selected_resolutions(rows, resolutions),
    }


def build_asset(asset: dict[str, object], refresh: bool) -> dict[str, object]:
    price_rows = read_daily_open(TSV_ROOT / f"{asset['slug']}.tsv")
    active_rows = fetch_active_addresses(asset, refresh)
    trend_rows = fetch_trends_weekly(asset, refresh)
    active_unavailable = None
    if active_rows is None:
        active_unavailable = (
            "Coin Metrics Community API 当前未公开该链的 AdrActCnt 日频序列；"
            "为避免混用付费源、链口径或合成数据，本刺激保持不可用。"
        )

    events = [
        {
            "date": observed,
            "title": title,
            "description": description,
            "category": category,
            "sourceUrl": source_url,
        }
        for observed, title, description, category, source_url in asset["events"]  # type: ignore[index]
    ]
    return {
        "id": asset["slug"],
        "name": asset["name"],
        "nameZh": asset["nameZh"],
        "symbol": asset["symbol"],
        "intro": asset["intro"],
        "events": events,
        "metrics": {
            "price": metric_payload(
                "price",
                price_rows,
                {
                    "provider": "Li Blockchain",
                    "dataset": "CMC original price data / tsv2026",
                    "sourceFile": f"cmc_original_price_data/tsv2026/{asset['slug']}.tsv",
                    "rawField": "Open*",
                    "aggregation": "calendar-period arithmetic mean of daily Open",
                    "licenseNote": "project-local research input",
                },
            ),
            "activeAddresses": metric_payload(
                "activeAddresses",
                active_rows,
                {
                    "provider": "Coin Metrics Community API",
                    "metric": "AdrActCnt",
                    "frequency": "1d",
                    "definitionUrl": "https://docs.coinmetrics.io/asset-metrics/addresses/adractcnt",
                    "endpoint": "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics",
                    "aggregation": "calendar-period arithmetic mean of daily AdrActCnt",
                },
                active_unavailable,
            ),
            "googleTrends": metric_payload(
                "googleTrends",
                trend_rows,
                {
                    "provider": "Google Trends Explore",
                    "topicId": asset["trendTopic"],
                    "topicLabel": asset["trendTopicLabel"],
                    "geo": "Worldwide",
                    "property": "Web Search",
                    "nativeResolution": "weekly",
                    "calibration": "two overlapping multi-year weekly windows; each window anchored to the full-range monthly series by the median positive-month scale ratio; shared weeks averaged; final series normalized to a peak of 100",
                    "samplingNote": "Google Trends uses a sample of aggregated, anonymized searches; repeated downloads can differ slightly.",
                    "aggregation": "calendar-period arithmetic mean of calibrated weekly index",
                    "dailyUnavailableReason": "Across a 2018-2026 study window, Google Trends Explore does not return one native daily series. Daily display is disabled instead of interpolating values.",
                },
                resolutions=("weekly", "monthly", "yearly"),
            ),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="ignore local source caches and download Coin Metrics / Google Trends again",
    )
    args = parser.parse_args()

    assets = [build_asset(asset, args.refresh) for asset in ASSETS]
    payload = {
        "protocolVersion": "context-elasticity-multimetric-v4",
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
        "requestedWindow": {
            "start": WINDOW_START.isoformat(),
            "end": WINDOW_END.isoformat(),
        },
        "resolutions": list(RESOLUTIONS),
        "metricCopy": METRIC_COPY,
        "dataset": {
            "price": "Li Blockchain CMC original daily Open",
            "activeAddresses": "Coin Metrics Community AdrActCnt; no synthetic gap filling",
            "googleTrends": "Google Trends topics, worldwide web search; calibrated daily-window reconstruction",
            "eventSetStatus": "traceable pilot annotations; freeze and preregister before confirmatory data collection",
        },
        "assets": assets,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    summary = {
        "output": str(OUTPUT),
        "bytes": OUTPUT.stat().st_size,
        "assets": {
            asset["symbol"]: {
                metric: {
                    "available": details["available"],
                    "daily": len(
                        details.get("resolutions", {})
                        .get("daily", {})
                        .get("points", [])
                    ),
                }
                for metric, details in asset["metrics"].items()
            }
            for asset in assets
        },
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
