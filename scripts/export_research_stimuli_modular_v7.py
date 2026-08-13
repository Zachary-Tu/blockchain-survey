"""Build the Boundary Lab fourth-edition modular stimulus bundle.

The preceding modular bundle deliberately used a common 2018--2026 window.
Edition four adds an explicit window manipulation, so the price series now
contain every observation available in the project-local Li Blockchain CMC
archive.  Other metrics retain their source-native coverage.  The participant
interface applies the preregisterable 2020-01-01--2024-12-31 curated window;
the source observations in this bundle are never overwritten or interpolated.
"""

from __future__ import annotations

import csv
import json
import math
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "public" / "data" / "research-stimuli-modular-v6.json"
OUTPUT = ROOT / "public" / "data" / "research-stimuli-modular-v7.json"
TSV_ROOT = Path(
    r"E:\Blockchain Matlab\code_LZ2022_transfer_20260810\code_LZ2022"
) / "cmc_original_price_data" / "tsv2026"

RESOLUTIONS = ("daily", "weekly", "monthly", "yearly")
CURATED_START = date(2020, 1, 1)
CURATED_END = date(2024, 12, 31)


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
            rows.append((observed, float(row[open_index].strip())))
    return sorted(rows)


def period_key(observed: date, resolution: str) -> tuple[int, ...]:
    if resolution == "weekly":
        monday = observed.fromordinal(observed.toordinal() - observed.weekday())
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


def normalize(values: list[float]) -> list[float]:
    low = min(values)
    high = max(values)
    if math.isclose(low, high):
        return [0.5] * len(values)
    return [(value - low) / (high - low) for value in values]


def reference_boundaries(
    rows: list[tuple[date, float]], count: int
) -> list[float]:
    """Return an SSE-optimal neutral proposal with ``count`` boundaries."""

    segment_count = count + 1
    if len(rows) < segment_count * 2:
        return [round(index / segment_count, 6) for index in range(1, segment_count)]

    values = normalize([math.log1p(value) for _, value in rows])
    sample_count = min(240, len(values))
    sampled = [
        values[round(index * (len(values) - 1) / (sample_count - 1))]
        for index in range(sample_count)
    ]
    prefix = [0.0]
    prefix_sq = [0.0]
    for value in sampled:
        prefix.append(prefix[-1] + value)
        prefix_sq.append(prefix_sq[-1] + value * value)

    def sse(start: int, end: int) -> float:
        length = end - start
        total = prefix[end] - prefix[start]
        total_sq = prefix_sq[end] - prefix_sq[start]
        return total_sq - total * total / length

    minimum = max(1, sample_count // 10)
    if segment_count * minimum > sample_count:
        minimum = max(1, sample_count // segment_count)

    infinity = float("inf")
    costs = [[infinity] * (sample_count + 1) for _ in range(segment_count + 1)]
    previous = [[-1] * (sample_count + 1) for _ in range(segment_count + 1)]
    costs[0][0] = 0.0
    for segment in range(1, segment_count + 1):
        earliest_end = segment * minimum
        latest_end = sample_count - (segment_count - segment) * minimum
        for end in range(earliest_end, latest_end + 1):
            for start in range((segment - 1) * minimum, end - minimum + 1):
                if not math.isfinite(costs[segment - 1][start]):
                    continue
                candidate = costs[segment - 1][start] + sse(start, end)
                if candidate < costs[segment][end]:
                    costs[segment][end] = candidate
                    previous[segment][end] = start

    end = sample_count
    splits: list[int] = []
    for segment in range(segment_count, 1, -1):
        start = previous[segment][end]
        if start < 0:
            return [
                round(index / segment_count, 6)
                for index in range(1, segment_count)
            ]
        splits.append(start)
        end = start
    return [round(split / sample_count, 6) for split in reversed(splits)]


def build_resolutions(rows: list[tuple[date, float]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for resolution in RESOLUTIONS:
        grouped = aggregate(rows, resolution)
        by_count = {
            str(count): reference_boundaries(grouped, count)
            for count in (1, 2, 3)
        }
        result[resolution] = {
            "points": [
                {"date": observed.isoformat(), "value": round(value, 6)}
                for observed, value in grouped
            ],
            "referenceBoundaries": by_count["2"],
            "referenceBoundariesByCount": by_count,
        }
    return result


def main() -> None:
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    source_windows: dict[str, dict[str, str]] = {}

    for asset in payload["assets"]:
        source_path = TSV_ROOT / f"{asset['id']}.tsv"
        rows = read_daily_open(source_path)
        price = asset["metrics"]["price"]
        price["resolutions"] = build_resolutions(rows)
        price["source"]["availableWindow"] = {
            "start": rows[0][0].isoformat(),
            "end": rows[-1][0].isoformat(),
        }
        price["source"]["observationCount"] = len(rows)
        price["source"]["windowPolicy"] = "all project-available observations"
        source_windows[asset["id"]] = price["source"]["availableWindow"]

    payload["protocolVersion"] = "boundary-lab-modular-v4"
    payload["datasetVersion"] = "research-stimuli-modular-v7"
    payload["generatedAt"] = datetime.now(tz=timezone.utc).isoformat()
    payload["requestedWindow"] = {
        "start": min(window["start"] for window in source_windows.values()),
        "end": max(window["end"] for window in source_windows.values()),
    }
    payload["curatedWindow"] = {
        "start": CURATED_START.isoformat(),
        "end": CURATED_END.isoformat(),
        "rule": (
            "fixed calendar window shared across assets and metrics; observations "
            "are filtered by date without interpolation or boundary padding"
        ),
        "rationale": (
            "preselected five-year window spanning the 2020 shock, 2021 expansion, "
            "2022 contraction, and recovery through 2024"
        ),
    }
    payload["sourceWindows"] = source_windows
    payload["dataset"]["price"] = (
        "Li Blockchain CMC original daily Open; all available observations per asset"
    )
    payload["dataset"]["windowProtocol"] = (
        "whole = source-native full coverage; truncated = fixed 2020-01-01 through "
        "2024-12-31 calendar window; no interpolation"
    )

    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "output": str(OUTPUT),
                "bytes": OUTPUT.stat().st_size,
                "protocolVersion": payload["protocolVersion"],
                "priceWindows": source_windows,
                "curatedWindow": payload["curatedWindow"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
