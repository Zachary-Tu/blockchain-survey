"""Upgrade the frozen v4 stimulus bundle for the six-condition v5 protocol.

The source observations are copied unchanged.  This script only adds
deterministic SSE reference proposals for one, two, and three boundaries so
that the paired A/B task families use the same curve data.
"""

from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "public" / "data" / "research-stimuli-v4.json"
OUTPUT = ROOT / "public" / "data" / "research-stimuli-v5.json"


def normalize(values: list[float]) -> list[float]:
    low = min(values)
    high = max(values)
    if math.isclose(low, high):
        return [0.5] * len(values)
    return [(value - low) / (high - low) for value in values]


def reference_boundaries(points: list[dict[str, object]], count: int) -> list[float]:
    """Return an SSE-optimal proposal with ``count`` ordered boundaries."""

    segments = count + 1
    if len(points) < segments * 2:
        return [round(index / segments, 6) for index in range(1, segments)]

    values = normalize([math.log1p(float(point["value"])) for point in points])
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
    if segments * minimum > sample_count:
        minimum = max(1, sample_count // segments)

    infinity = float("inf")
    costs = [[infinity] * (sample_count + 1) for _ in range(segments + 1)]
    previous = [[-1] * (sample_count + 1) for _ in range(segments + 1)]
    costs[0][0] = 0.0

    for segment in range(1, segments + 1):
        earliest_end = segment * minimum
        latest_end = sample_count - (segments - segment) * minimum
        for end in range(earliest_end, latest_end + 1):
            earliest_start = (segment - 1) * minimum
            latest_start = end - minimum
            for start in range(earliest_start, latest_start + 1):
                if not math.isfinite(costs[segment - 1][start]):
                    continue
                candidate = costs[segment - 1][start] + sse(start, end)
                if candidate < costs[segment][end]:
                    costs[segment][end] = candidate
                    previous[segment][end] = start

    end = sample_count
    splits: list[int] = []
    for segment in range(segments, 1, -1):
        start = previous[segment][end]
        if start < 0:
            return [round(index / segments, 6) for index in range(1, segments)]
        splits.append(start)
        end = start
    splits.reverse()
    # ``split`` is the start index of the next segment, so dividing by the
    # number of samples places the boundary between observations and keeps it
    # strictly inside (0, 1), even for short yearly series.
    return [round(split / sample_count, 6) for split in splits]


def main() -> None:
    payload = json.loads(INPUT.read_text(encoding="utf-8"))
    for asset in payload["assets"]:
        for metric in asset["metrics"].values():
            for resolution in metric.get("resolutions", {}).values():
                points = resolution["points"]
                by_count = {
                    str(count): reference_boundaries(points, count)
                    for count in (1, 2, 3)
                }
                resolution["referenceBoundariesByCount"] = by_count
                resolution["referenceBoundaries"] = by_count["2"]

    payload["protocolVersion"] = "context-elasticity-multimetric-v5"
    payload["generatedAt"] = datetime.now(tz=timezone.utc).isoformat()
    payload["dataset"]["referenceBoundaryMethod"] = (
        "deterministic SSE-optimal piecewise-constant proposals for 1, 2, and 3 "
        "boundaries; neutral references, not ground truth"
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
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
