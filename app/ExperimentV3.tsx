"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";

type MetricKey = "price" | "activeAddresses" | "googleTrends";
type BoundaryCount = 1 | 2 | 3;
type PlacementTaskMode = "placement-1" | "placement-2" | "placement-3";
type EvaluationTaskMode = "evaluation-1" | "evaluation-2" | "evaluation-3";
type TaskMode = PlacementTaskMode | EvaluationTaskMode;
type TaskFamily = "placement" | "evaluation";
type Resolution = "daily" | "weekly" | "monthly" | "yearly";
type ScaleMode = "linear" | "log";
type Phase = "setup" | "experiment" | "reward" | "complete";

type Point = { date: string; value: number };
type ResolutionData = {
  points: Point[];
  referenceBoundaries: number[];
  referenceBoundariesByCount?: Partial<Record<`${BoundaryCount}`, number[]>>;
};
type MetricData = {
  name: string;
  shortName: string;
  unit: string;
  definition: string;
  available: boolean;
  unavailableReason?: string;
  source: Record<string, unknown>;
  resolutionAvailability?: Partial<Record<Resolution, boolean>>;
  resolutions: Partial<Record<Resolution, ResolutionData>>;
};
type EventAnnotation = {
  date: string;
  title: string;
  description: string;
  category: string;
  sourceUrl: string;
};
type Asset = {
  id: string;
  name: string;
  nameZh: string;
  symbol: string;
  intro: string;
  events: EventAnnotation[];
  metrics: Record<MetricKey, MetricData>;
};
type StimulusBundle = {
  protocolVersion: string;
  generatedAt: string;
  requestedWindow: { start: string; end: string };
  resolutions: Resolution[];
  assets: Asset[];
};
type BoundaryRecord = { index: number; ratio: number; date: string };
type BoundaryIntervalRecord = {
  boundaryIndex: number;
  centerRatio: number;
  halfWidthRatio: number;
  widthRatio: number;
  lowerRatio: number;
  upperRatio: number;
  lowerIndex: number;
  upperIndex: number;
  lowerDate: string;
  upperDate: string;
};
type LocalAnswer = {
  stimulusId: string;
  assetId: string;
  assetSymbol: string;
  assetOrder: number;
  disclosureLevel: number;
  disclosureKey: string;
  boundaries: BoundaryRecord[];
  previousBoundaries: BoundaryRecord[];
  referenceBoundaries: BoundaryRecord[];
  boundaryIntervals: BoundaryIntervalRecord[];
  reasonablenessRating: number | null;
  confidence: number;
  influenceRating: number | null;
  noChangeConfirmed: boolean;
  scaleMode: ScaleMode;
  elapsedMs: number;
  adjustmentCount: number;
  uncertaintyAdjustmentCount: number;
  scaleSwitchCount: number;
};

const METRIC_OPTIONS: Array<{
  key: MetricKey;
  index: string;
  title: string;
  english: string;
  description: string;
}> = [
  {
    key: "price",
    index: "01",
    title: "价格数据",
    english: "PRICE",
    description: "美元开盘价；四个币种均覆盖，并支持四种时间分辨率。",
  },
  {
    key: "activeAddresses",
    index: "02",
    title: "活跃地址",
    english: "ACTIVE ADDRESSES",
    description: "每日唯一活跃地址数；当前公开同口径数据覆盖 BTC 与 ETH。",
  },
  {
    key: "googleTrends",
    index: "03",
    title: "Google 搜索热度",
    english: "GOOGLE TRENDS",
    description: "全球网页搜索相对热度；长时间窗使用原生周频，并可聚合为月/年。",
  },
];

const TASK_GROUPS: Array<{
  family: TaskFamily;
  index: "A" | "B";
  title: string;
  description: string;
  options: Array<{
    key: TaskMode;
    count: BoundaryCount;
    title: string;
    subtitle: string;
  }>;
}> = [
  {
    family: "placement",
    index: "A",
    title: "自主选择分界点",
    description: "测试者亲自移动固定数量的分界线，并为每条线给出一个可能范围。",
    options: ([1, 2, 3] as BoundaryCount[]).map((count) => ({
      key: `placement-${count}` as TaskMode,
      count,
      title: `${count} 个分界点`,
      subtitle: `划分为 ${count + 1} 个阶段`,
    })),
  },
  {
    family: "evaluation",
    index: "B",
    title: "评价预设阶段",
    description: "系统给出固定数量的分界线，测试者只评价这套阶段划分是否合理。",
    options: ([1, 2, 3] as BoundaryCount[]).map((count) => ({
      key: `evaluation-${count}` as TaskMode,
      count,
      title: `${count} 个预设分界点`,
      subtitle: `评价 ${count + 1} 阶段方案`,
    })),
  },
];

const UNCERTAINTY_WIDTH_OPTIONS = [
  { halfWidth: 0.01, label: "很窄", widthLabel: "约 2%" },
  { halfWidth: 0.025, label: "较窄", widthLabel: "约 5%" },
  { halfWidth: 0.05, label: "中等", widthLabel: "约 10%" },
  { halfWidth: 0.08, label: "较宽", widthLabel: "约 16%" },
  { halfWidth: 0.12, label: "很宽", widthLabel: "约 24%" },
] as const;

const RESOLUTION_COPY: Record<Resolution, { zh: string; en: string }> = {
  daily: { zh: "日", en: "DAILY" },
  weekly: { zh: "周", en: "WEEKLY" },
  monthly: { zh: "月", en: "MONTHLY" },
  yearly: { zh: "年", en: "YEARLY" },
};

const DISCLOSURES = [
  {
    key: "shape",
    step: "01",
    title: "只看曲线",
    short: "形状",
    description: "不显示名称、日期、坐标单位或事件。",
  },
  {
    key: "identity",
    step: "02",
    title: "名称与背景",
    short: "身份",
    description: "披露资产、指标名称与一段中性背景介绍。",
  },
  {
    key: "axes",
    step: "03",
    title: "时间轴与单位",
    short: "坐标",
    description: "披露真实时间、数值单位；价格条件同时解锁对数刻度。",
  },
  {
    key: "events",
    step: "04",
    title: "重要事件",
    short: "事件",
    description: "在轴上标注事件，并提供日期与中性说明。",
  },
] as const;

const CUE_TAGS = [
  "趋势方向",
  "转折与极值",
  "波动幅度",
  "持续时间",
  "资产背景",
  "数值水平",
  "事件信息",
  "其他",
];

const METRIC_LABEL: Record<MetricKey, string> = {
  price: "价格数据",
  activeAddresses: "活跃地址",
  googleTrends: "Google 搜索热度",
};

const TASK_LABEL: Record<TaskMode, string> = {
  "placement-1": "A1 · 自主选择 1 个分界点",
  "placement-2": "A2 · 自主选择 2 个分界点",
  "placement-3": "A3 · 自主选择 3 个分界点",
  "evaluation-1": "B1 · 评价 1 个预设分界点",
  "evaluation-2": "B2 · 评价 2 个预设分界点",
  "evaluation-3": "B3 · 评价 3 个预设分界点",
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function taskFamily(taskMode: TaskMode): TaskFamily {
  return taskMode.startsWith("placement-") ? "placement" : "evaluation";
}

function taskBoundaryCount(taskMode: TaskMode): BoundaryCount {
  return Number(taskMode.at(-1)) as BoundaryCount;
}

function initialBoundaries(count: BoundaryCount) {
  return Array.from({ length: count }, (_, index) => (index + 1) / (count + 1));
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  const values = new Uint32Array(copy.length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(values);
  } else {
    for (let index = 0; index < values.length; index += 1) {
      values[index] = Math.floor(Math.random() * 2 ** 32);
    }
  }
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = values[index] % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function formatDate(value: string, resolution: Resolution) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (resolution === "yearly") return String(parsed.getUTCFullYear());
  if (resolution === "monthly") {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function formatValue(metric: MetricKey, value: number) {
  if (metric === "price") {
    if (value >= 1000) return `$${Math.round(value).toLocaleString("en-US")}`;
    if (value >= 10) return `$${value.toFixed(1)}`;
    return `$${value.toFixed(2)}`;
  }
  if (metric === "activeAddresses") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return Math.round(value).toLocaleString("zh-CN");
  }
  return value.toFixed(1);
}

function nearestIndex(points: Point[], dateValue: string) {
  const target = new Date(`${dateValue}T00:00:00Z`).getTime();
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const candidate = Math.abs(
      new Date(`${points[index].date}T00:00:00Z`).getTime() - target,
    );
    if (candidate < distance) {
      best = index;
      distance = candidate;
    }
  }
  return best;
}

function boundariesToRecords(ratios: number[], points: Point[]): BoundaryRecord[] {
  return [...ratios]
    .sort((a, b) => a - b)
    .map((ratio) => {
      const index = clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1);
      return { index, ratio: Number(ratio.toFixed(6)), date: points[index].date };
    });
}

function intervalsToRecords(
  boundaries: number[],
  halfWidths: Array<number | null>,
  points: Point[],
): BoundaryIntervalRecord[] {
  return boundaries.flatMap((centerRatio, boundaryIndex) => {
    const halfWidthRatio = halfWidths[boundaryIndex];
    if (halfWidthRatio === null || halfWidthRatio === undefined) return [];
    const lowerRatio = clamp(centerRatio - halfWidthRatio, 0, 1);
    const upperRatio = clamp(centerRatio + halfWidthRatio, 0, 1);
    const lowerIndex = clamp(
      Math.round(lowerRatio * (points.length - 1)),
      0,
      points.length - 1,
    );
    const upperIndex = clamp(
      Math.round(upperRatio * (points.length - 1)),
      0,
      points.length - 1,
    );
    return [
      {
        boundaryIndex,
        centerRatio: Number(centerRatio.toFixed(6)),
        halfWidthRatio: Number(halfWidthRatio.toFixed(6)),
        widthRatio: Number((upperRatio - lowerRatio).toFixed(6)),
        lowerRatio: Number(lowerRatio.toFixed(6)),
        upperRatio: Number(upperRatio.toFixed(6)),
        lowerIndex,
        upperIndex,
        lowerDate: points[lowerIndex].date,
        upperDate: points[upperIndex].date,
      },
    ];
  });
}

function samePrimaryResponse(
  taskMode: TaskMode,
  boundaries: number[],
  halfWidths: Array<number | null>,
  rating: number | null,
  previous?: LocalAnswer,
) {
  if (!previous) return false;
  if (taskFamily(taskMode) === "evaluation") {
    return rating === previous.reasonablenessRating;
  }
  if (boundaries.length !== previous.boundaries.length) return false;
  const sameCenters = boundaries.every(
    (ratio, index) => Math.abs(ratio - previous.boundaries[index].ratio) < 0.001,
  );
  const sameIntervals = halfWidths.every((halfWidth, index) => {
    const previousHalfWidth = previous.boundaryIntervals[index]?.halfWidthRatio;
    return (
      halfWidth !== null &&
      previousHalfWidth !== undefined &&
      Math.abs(halfWidth - previousHalfWidth) < 0.001
    );
  });
  return sameCenters && sameIntervals;
}

function RatingScale({
  value,
  onChange,
  leftLabel,
  rightLabel,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number) => void;
  leftLabel: string;
  rightLabel: string;
  ariaLabel: string;
}) {
  return (
    <div className="research-rating-wrap">
      <div className="research-rating" role="radiogroup" aria-label={ariaLabel}>
        {[1, 2, 3, 4, 5].map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === option}
            className={value === option ? "is-selected" : ""}
            key={option}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="research-rating-labels">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TrendChart({
  points,
  metric,
  resolution,
  scaleMode,
  disclosureLevel,
  boundaries,
  boundaryHalfWidths,
  previousBoundaries,
  referenceBoundaries,
  taskMode,
  events,
  onBoundariesChange,
  onInteraction,
}: {
  points: Point[];
  metric: MetricKey;
  resolution: Resolution;
  scaleMode: ScaleMode;
  disclosureLevel: number;
  boundaries: number[];
  boundaryHalfWidths: Array<number | null>;
  previousBoundaries: number[];
  referenceBoundaries: number[];
  taskMode: TaskMode;
  events: EventAnnotation[];
  onBoundariesChange: (values: number[]) => void;
  onInteraction: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragMoved = useRef(false);
  const width = 1040;
  const height = 570;
  const axesVisible = disclosureLevel >= 2;
  const margin = axesVisible
    ? { top: 34, right: 28, bottom: 62, left: 88 }
    : { top: 28, right: 28, bottom: 28, left: 28 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const transformed = useMemo(
    () =>
      points.map((point) =>
        scaleMode === "log" && metric === "price"
          ? Math.log10(Math.max(point.value, Number.EPSILON))
          : point.value,
      ),
    [metric, points, scaleMode],
  );
  const minimum = Math.min(...transformed);
  const maximum = Math.max(...transformed);
  const spread = maximum - minimum || 1;
  const xAt = (ratio: number) => margin.left + ratio * plotWidth;
  const yAt = (value: number) =>
    margin.top + plotHeight - ((value - minimum) / spread) * plotHeight;
  const path = points
    .map((_, index) => {
      const x = margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
      const y = yAt(transformed[index]);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const isEvaluation = taskFamily(taskMode) === "evaluation";
  const activeBoundaries = isEvaluation ? referenceBoundaries : boundaries;
  const stageEdges = [0, ...activeBoundaries, 1];
  const visibleEvents = disclosureLevel >= 3 ? events : [];

  const pointerRatio = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const viewX = ((event.clientX - bounds.left) / bounds.width) * width;
      return clamp((viewX - margin.left) / plotWidth, 0.02, 0.98);
    },
    [margin.left, plotWidth],
  );

  const moveBoundary = useCallback(
    (index: number, ratio: number) => {
      const sorted = [...boundaries];
      const lower = index === 0 ? 0.02 : sorted[index - 1] + 0.02;
      const upper = index === sorted.length - 1 ? 0.98 : sorted[index + 1] - 0.02;
      sorted[index] = clamp(ratio, lower, upper);
      onBoundariesChange(sorted);
      onInteraction();
    },
    [boundaries, onBoundariesChange, onInteraction],
  );

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const ratio = pointerRatio(event);
    setHoverIndex(
      clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1),
    );
    if (dragging !== null && !isEvaluation) {
      dragMoved.current = true;
      moveBoundary(dragging, ratio);
    }
  };

  const handleChartClick = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (isEvaluation || dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    const ratio = pointerRatio(event);
    const nearest = boundaries.reduce(
      (best, value, index) =>
        Math.abs(value - ratio) < Math.abs(boundaries[best] - ratio) ? index : best,
      0,
    );
    moveBoundary(nearest, ratio);
  };

  const inverseTransform = (value: number) =>
    scaleMode === "log" && metric === "price" ? 10 ** value : value;

  return (
    <div className="research-chart-frame">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="用于阶段判断的时间序列曲线"
        className="research-chart"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHoverIndex(null);
          setDragging(null);
        }}
        onPointerUp={() => setDragging(null)}
        onClick={handleChartClick}
      >
        <defs>
          <linearGradient id="curveAreaV4" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#244f4a" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#244f4a" stopOpacity="0.01" />
          </linearGradient>
          <filter id="lineGlowV4" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" />
          </filter>
        </defs>

        {stageEdges.slice(0, -1).map((edge, index) => {
          const next = stageEdges[index + 1];
          return (
            <g key={`${edge}-${next}`}>
              <rect
                x={xAt(edge)}
                y={margin.top}
                width={Math.max(0, xAt(next) - xAt(edge))}
                height={plotHeight}
                fill={["#dfe9e5", "#f4ecd7", "#f2e2da", "#e8e4f2", "#e6eee0", "#f1dfc8"][index % 6]}
                opacity="0.64"
              />
              <text
                x={(xAt(edge) + xAt(next)) / 2}
                y={margin.top + 25}
                textAnchor="middle"
                className="research-stage-label"
              >
                阶段 {index + 1}
              </text>
            </g>
          );
        })}

        {!isEvaluation &&
          boundaries.map((ratio, index) => {
            const halfWidth = boundaryHalfWidths[index];
            if (halfWidth === null || halfWidth === undefined) return null;
            const lower = clamp(ratio - halfWidth, 0, 1);
            const upper = clamp(ratio + halfWidth, 0, 1);
            return (
              <rect
                key={`uncertainty-band-${index}`}
                className={`research-boundary-band band-${index}`}
                x={xAt(lower)}
                y={margin.top}
                width={Math.max(2, xAt(upper) - xAt(lower))}
                height={plotHeight}
              />
            );
          })}

        {axesVisible &&
          [0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={`grid-${ratio}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={margin.top + ratio * plotHeight}
                y2={margin.top + ratio * plotHeight}
                className="research-grid"
              />
              <text
                x={margin.left - 14}
                y={margin.top + ratio * plotHeight + 5}
                textAnchor="end"
                className="research-axis-tick"
              >
                {formatValue(metric, inverseTransform(maximum - ratio * spread))}
              </text>
            </g>
          ))}

        {axesVisible &&
          [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const index = clamp(
              Math.round(ratio * (points.length - 1)),
              0,
              points.length - 1,
            );
            return (
              <text
                key={`x-${ratio}`}
                x={xAt(ratio)}
                y={height - 27}
                textAnchor={ratio === 0 ? "start" : ratio === 1 ? "end" : "middle"}
                className="research-axis-tick"
              >
                {formatDate(points[index].date, resolution)}
              </text>
            );
          })}

        <path
          d={`${path} L${width - margin.right},${height - margin.bottom} L${margin.left},${height - margin.bottom} Z`}
          fill="url(#curveAreaV4)"
        />
        <path d={path} className="research-curve-line" filter="url(#lineGlowV4)" />

        {visibleEvents.map((event, index) => {
          const pointIndex = nearestIndex(points, event.date);
          const ratio = pointIndex / Math.max(1, points.length - 1);
          const x = xAt(ratio);
          const y = yAt(transformed[pointIndex]);
          return (
            <g key={`${event.date}-${event.title}`} className="research-event-marker">
              <line x1={x} x2={x} y1={margin.top + 8} y2={height - margin.bottom} />
              <circle cx={x} cy={y} r="11" />
              <text x={x} y={y + 4} textAnchor="middle">
                {index + 1}
              </text>
            </g>
          );
        })}


        {!isEvaluation &&
          previousBoundaries.map((ratio, index) => (
            <g
              key={`previous-boundary-${index}-${ratio}`}
              className="research-previous-boundary"
              pointerEvents="none"
            >
              <line
                x1={xAt(ratio)}
                x2={xAt(ratio)}
                y1={margin.top}
                y2={height - margin.bottom}
              />
              <rect
                x={xAt(ratio) - 31}
                y={height - margin.bottom - 24}
                width="62"
                height="19"
                rx="9.5"
              />
              <text
                x={xAt(ratio)}
                y={height - margin.bottom - 11}
                textAnchor="middle"
              >
                上一层 {index + 1}
              </text>
            </g>
          ))}

        {activeBoundaries.map((ratio, index) => (
          <g
            key={`boundary-${index}-${ratio}`}
            className={`research-boundary ${isEvaluation ? "is-reference" : ""}`}
            onPointerDown={(event) => {
              if (isEvaluation) return;
              event.stopPropagation();
              dragMoved.current = false;
              setDragging(index);
              svgRef.current?.setPointerCapture(event.pointerId);
              onInteraction();
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
            }}
          >
            <line
              x1={xAt(ratio)}
              x2={xAt(ratio)}
              y1={margin.top}
              y2={height - margin.bottom}
            />
            <rect x={xAt(ratio) - 38} y={margin.top - 17} width="76" height="30" rx="15" />
            <text x={xAt(ratio)} y={margin.top + 3} textAnchor="middle">
              {isEvaluation ? `预设 ${index + 1}` : `分界点 ${index + 1}`}
            </text>
            {!isEvaluation && (
              <circle cx={xAt(ratio)} cy={margin.top + plotHeight * 0.52} r="16" />
            )}
          </g>
        ))}

        {axesVisible && hoverIndex !== null && (
          <g className="research-tooltip" pointerEvents="none">
            <line
              x1={margin.left + (hoverIndex / Math.max(1, points.length - 1)) * plotWidth}
              x2={margin.left + (hoverIndex / Math.max(1, points.length - 1)) * plotWidth}
              y1={margin.top}
              y2={height - margin.bottom}
            />
            <rect
              x={clamp(
                margin.left + (hoverIndex / Math.max(1, points.length - 1)) * plotWidth - 78,
                margin.left,
                width - margin.right - 156,
              )}
              y={margin.top + 42}
              width="156"
              height="52"
              rx="10"
            />
            <text
              x={clamp(
                margin.left + (hoverIndex / Math.max(1, points.length - 1)) * plotWidth,
                margin.left + 78,
                width - margin.right - 78,
              )}
              y={margin.top + 64}
              textAnchor="middle"
            >
              {formatDate(points[hoverIndex].date, resolution)}
            </text>
            <text
              x={clamp(
                margin.left + (hoverIndex / Math.max(1, points.length - 1)) * plotWidth,
                margin.left + 78,
                width - margin.right - 78,
              )}
              y={margin.top + 84}
              textAnchor="middle"
            >
              {formatValue(metric, points[hoverIndex].value)}
            </text>
          </g>
        )}

        {axesVisible && (
          <>
            <text
              x={margin.left + plotWidth / 2}
              y={height - 4}
              textAnchor="middle"
              className="research-axis-title"
            >
              真实时间（{RESOLUTION_COPY[resolution].zh}频）
            </text>
            <text
              x="20"
              y={margin.top + plotHeight / 2}
              textAnchor="middle"
              transform={`rotate(-90 20 ${margin.top + plotHeight / 2})`}
              className="research-axis-title"
            >
              {metric === "price"
                ? `价格（USD${scaleMode === "log" ? "，对数刻度" : ""}）`
                : metric === "activeAddresses"
                  ? "日活跃地址数（区间均值）"
                  : "Google 搜索热度指数"}
            </text>
          </>
        )}
      </svg>
      <div className="research-chart-caption">
        <span>
          {isEvaluation
            ? "预设分界点不可移动，请在右侧评价方案。"
            : previousBoundaries.length
              ? "橙色虚线是上一层的位置；拖动深绿色手柄，决定本层是否需要移动。"
              : `拖动圆形手柄或点击曲线，调整 ${boundaries.length} 个分界点。`}
        </span>
        <span>{points.length.toLocaleString("zh-CN")} 个观测点</span>
      </div>
    </div>
  );
}

function BoundaryControls({
  boundaries,
  boundaryHalfWidths,
  taskMode,
  points,
  resolution,
  disclosureLevel,
  onChange,
  onHalfWidthsChange,
  onInteraction,
  onUncertaintyInteraction,
}: {
  boundaries: number[];
  boundaryHalfWidths: Array<number | null>;
  taskMode: TaskMode;
  points: Point[];
  resolution: Resolution;
  disclosureLevel: number;
  onChange: (values: number[]) => void;
  onHalfWidthsChange: (values: Array<number | null>) => void;
  onInteraction: () => void;
  onUncertaintyInteraction: () => void;
}) {
  if (taskFamily(taskMode) === "evaluation") return null;
  const update = (index: number, ratio: number) => {
    const copy = [...boundaries];
    const lower = index === 0 ? 0.02 : copy[index - 1] + 0.02;
    const upper = index === copy.length - 1 ? 0.98 : copy[index + 1] - 0.02;
    copy[index] = clamp(ratio, lower, upper);
    onChange(copy);
    onInteraction();
  };
  return (
    <div className="research-boundary-controls">
      <div className="research-boundary-controls-head">
        <div>
          <span className="research-eyebrow">阶段分界</span>
          <strong>{`本任务固定 ${boundaries.length} 个分界点，形成 ${boundaries.length + 1} 个阶段`}</strong>
        </div>
        <span className="research-range-legend"><i /> 半透明色带 = 你认为可能的范围</span>
      </div>
      <div className="research-estimate-grid">
        {boundaries.map((ratio, index) => {
          const pointIndex = clamp(
            Math.round(ratio * (points.length - 1)),
            0,
            points.length - 1,
          );
          const selectedHalfWidth = boundaryHalfWidths[index];
          const interval = intervalsToRecords(
            [ratio],
            [selectedHalfWidth ?? null],
            points,
          )[0];
          return (
            <section key={`slider-${index}`} className="research-boundary-estimate">
              <div className="research-boundary-slider">
                <span>
                  <strong>分界点 {index + 1} · 最佳位置</strong>
                  <em>
                    {disclosureLevel >= 2
                      ? formatDate(points[pointIndex].date, resolution)
                      : `曲线位置 ${(ratio * 100).toFixed(1)}%`}
                  </em>
                </span>
                <input
                  id={`boundary-slider-${index}`}
                  aria-label={`分界点 ${index + 1} 的最佳位置`}
                  type="range"
                  min="2"
                  max="98"
                  step="0.1"
                  value={ratio * 100}
                  onChange={(event) => update(index, Number(event.target.value) / 100)}
                />
              </div>

              <fieldset className="research-uncertainty-picker">
                <legend>你认为最佳分界线大致落在哪个范围内？</legend>
                <p>请选择线外色带的宽度；中心仍是上面的最佳位置。</p>
                <div role="radiogroup" aria-label={`分界点 ${index + 1} 的可能范围宽度`}>
                  {UNCERTAINTY_WIDTH_OPTIONS.map((option, optionIndex) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedHalfWidth === option.halfWidth}
                      className={selectedHalfWidth === option.halfWidth ? "is-selected" : ""}
                      key={option.halfWidth}
                      onClick={() => {
                        const next = [...boundaryHalfWidths];
                        next[index] = option.halfWidth;
                        onHalfWidthsChange(next);
                        onUncertaintyInteraction();
                      }}
                    >
                      <span className="research-width-icon">
                        <i style={{ width: `${14 + optionIndex * 8}px` }} />
                        <b />
                      </span>
                      <strong>{option.label}</strong>
                      <small>{option.widthLabel}</small>
                    </button>
                  ))}
                </div>
                <output className={interval ? "is-complete" : ""}>
                  {interval
                    ? disclosureLevel >= 2
                      ? `可能范围：${formatDate(interval.lowerDate, resolution)} — ${formatDate(interval.upperDate, resolution)}`
                      : `可能范围宽度：约占整条曲线的 ${(interval.widthRatio * 100).toFixed(0)}%`
                    : "尚未选择范围（本轮必答）"}
                </output>
              </fieldset>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProtocolRail({ level }: { level: number }) {
  return (
    <div className="research-protocol-rail" aria-label="四级信息披露进度">
      {DISCLOSURES.map((item, index) => (
        <div
          key={item.key}
          className={`${index === level ? "is-current" : ""} ${index < level ? "is-complete" : ""} ${index > level ? "is-hidden" : ""}`}
        >
          <span>{index < level ? "✓" : index > level ? "?" : item.step}</span>
          <div>
            <strong>{index > level ? "？" : item.short}</strong>
            <small>{index > level ? "？" : item.title}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ExperimentV3() {
  const [bundle, setBundle] = useState<StimulusBundle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [taskMode, setTaskMode] = useState<TaskMode>("placement-2");
  const [resolution, setResolution] = useState<Resolution>("weekly");
  const [actorType, setActorType] = useState<"human" | "agent">("human");
  const [participantCode, setParticipantCode] = useState("");
  const [expertise, setExpertise] = useState("none");
  const [modelName, setModelName] = useState("");
  const [consent, setConsent] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [assetOrder, setAssetOrder] = useState<Asset[]>([]);
  const [assetCursor, setAssetCursor] = useState(0);
  const [level, setLevel] = useState(0);
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  const [boundaries, setBoundaries] = useState<number[]>([1 / 3, 2 / 3]);
  const [boundaryHalfWidths, setBoundaryHalfWidths] = useState<Array<number | null>>([
    null,
    null,
  ]);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const [scaleSwitchCount, setScaleSwitchCount] = useState(0);
  const [reasonableness, setReasonableness] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [influence, setInfluence] = useState<number | null>(null);
  const [cueTags, setCueTags] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");
  const [noChangeConfirmed, setNoChangeConfirmed] = useState(false);
  const [answers, setAnswers] = useState<LocalAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [startError, setStartError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [uncertaintyAdjustmentCount, setUncertaintyAdjustmentCount] = useState(0);
  const [firstMoveAt, setFirstMoveAt] = useState<number | null>(null);
  const [firstUncertaintyAt, setFirstUncertaintyAt] = useState<number | null>(null);
  const [firstInteractionAt, setFirstInteractionAt] = useState<number | null>(null);
  const stepStartedAt = useRef<number>(0);

  useEffect(() => {
    let active = true;
    fetch("/data/research-stimuli-v5.json")
      .then((response) => {
        if (!response.ok) throw new Error("研究刺激数据加载失败");
        return response.json() as Promise<StimulusBundle>;
      })
      .then((data) => {
        if (active) setBundle(data);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "研究刺激数据加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const availability = useMemo(() => {
    if (!bundle) return null;
    return Object.fromEntries(
      METRIC_OPTIONS.map((option) => [
        option.key,
        Object.fromEntries(
          bundle.resolutions.map((item) => [
            item,
            bundle.assets.filter(
              (asset) => asset.metrics[option.key].resolutions[item]?.points.length,
            ).length,
          ]),
        ),
      ]),
    ) as Record<MetricKey, Record<Resolution, number>>;
  }, [bundle]);

  const selectMetric = (nextMetric: MetricKey) => {
    setMetric(nextMetric);
    if (!availability || availability[nextMetric][resolution] > 0) return;
    const fallback = (["weekly", "monthly", "yearly", "daily"] as Resolution[]).find(
      (candidate) => availability[nextMetric][candidate] > 0,
    );
    if (fallback) setResolution(fallback);
  };

  const currentAsset = assetOrder[assetCursor];
  const currentMetric = currentAsset?.metrics[metric];
  const resolutionData = currentMetric?.resolutions[resolution];
  const points = resolutionData?.points ?? [];
  const targetBoundaryCount = taskBoundaryCount(taskMode);
  const isEvaluationTask = taskFamily(taskMode) === "evaluation";
  const referenceBoundaries =
    resolutionData?.referenceBoundariesByCount?.[String(targetBoundaryCount) as `${BoundaryCount}`] ??
    (targetBoundaryCount === 2
      ? resolutionData?.referenceBoundaries
      : undefined) ??
    initialBoundaries(targetBoundaryCount);
  const stimulusId = currentAsset
    ? `${currentAsset.id}-${metric}-${resolution}-${taskMode}`
    : "";
  const previousAnswer = answers.find(
    (answer) =>
      answer.stimulusId === stimulusId && answer.disclosureLevel === level - 1,
  );
  const previousBoundaryRatios = previousAnswer?.boundaries.map((boundary) => boundary.ratio) ?? [];
  const primaryComplete =
    isEvaluationTask
      ? reasonableness !== null
      : boundaries.length === targetBoundaryCount &&
        boundaryHalfWidths.length === targetBoundaryCount &&
        boundaryHalfWidths.every((halfWidth) => halfWidth !== null);
  const unchanged =
    level > 0 &&
    primaryComplete &&
    samePrimaryResponse(
      taskMode,
      boundaries,
      boundaryHalfWidths,
      reasonableness,
      previousAnswer,
    );
  const responseComplete =
    primaryComplete &&
    confidence !== null &&
    (level === 0 || influence !== null) &&
    (!unchanged || noChangeConfirmed);

  const markInteraction = useCallback((isBoundaryMove = false) => {
    const now = Date.now();
    setFirstInteractionAt((previous) => previous ?? now);
    if (isBoundaryMove) {
      setFirstMoveAt((previous) => previous ?? now);
      setAdjustmentCount((value) => value + 1);
    }
  }, []);

  const markUncertaintyInteraction = useCallback(() => {
    const now = Date.now();
    setFirstInteractionAt((previous) => previous ?? now);
    setFirstUncertaintyAt((previous) => previous ?? now);
    setUncertaintyAdjustmentCount((value) => value + 1);
  }, []);

  const resetStepFields = useCallback(() => {
    setConfidence(null);
    setInfluence(null);
    setReasonableness(null);
    setCueTags([]);
    setRationale("");
    setNoChangeConfirmed(false);
    setAdjustmentCount(0);
    setUncertaintyAdjustmentCount(0);
    setScaleSwitchCount(0);
    setFirstMoveAt(null);
    setFirstUncertaintyAt(null);
    setFirstInteractionAt(null);
    setSubmitError("");
    stepStartedAt.current = Date.now();
  }, []);

  const startStudy = async () => {
    if (!bundle || !availability || !consent) return;
    const eligible = bundle.assets.filter(
      (asset) => asset.metrics[metric].resolutions[resolution]?.points.length,
    );
    if (!eligible.length) {
      setStartError("该指标与分辨率组合没有可用刺激。");
      return;
    }
    if (actorType === "agent" && !modelName.trim()) {
      setStartError("Agent 条件需要填写模型或系统名称。");
      return;
    }
    setStartError("");
    const order = shuffled(eligible);
    const code = participantCode.trim() || `ANON-${Date.now().toString(36).toUpperCase()}`;
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorType,
          participantCode: code,
          expertise,
          experimentalArm: `${metric}-${taskMode}-${resolution}`,
          protocolVersion: bundle.protocolVersion,
          modelName: actorType === "agent" ? modelName.trim() : null,
          studyConfig: {
            metric,
            taskMode,
            taskFamily: taskFamily(taskMode),
            targetBoundaryCount,
            resolution,
            requestedWindow: bundle.requestedWindow,
            assetOrder: order.map((asset) => asset.id),
            scalePolicy: metric === "price" ? "participant-choice-from-level-3" : "linear-only",
            disclosureOrder: DISCLOSURES.map((item) => item.key),
            responseDefaults: "none",
            uncertaintyPolicy:
              taskFamily(taskMode) === "placement"
                ? "symmetric-band-required-per-boundary; five frozen width choices"
                : "not-applicable",
          },
        }),
      });
      const payload = (await response.json()) as {
        session?: { id: string };
        error?: string;
      };
      if (!response.ok || !payload.session) {
        throw new Error(payload.error || "无法创建研究会话");
      }
      setParticipantCode(code);
      setSessionId(payload.session.id);
      setAssetOrder(order);
      setAssetCursor(0);
      setLevel(0);
      setBoundaries(
        taskFamily(taskMode) === "placement"
          ? initialBoundaries(targetBoundaryCount)
          : [],
      );
      setBoundaryHalfWidths(
        taskFamily(taskMode) === "placement"
          ? Array.from({ length: targetBoundaryCount }, () => null)
          : [],
      );
      setScaleMode("linear");
      setAnswers([]);
      resetStepFields();
      setPhase("experiment");
    } catch (error) {
      setStartError(error instanceof Error ? error.message : "无法创建研究会话");
    }
  };

  const submitResponse = async () => {
    if (
      !currentAsset ||
      !resolutionData ||
      !sessionId ||
      confidence === null ||
      !responseComplete
    ) {
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const now = Date.now();
    const chosenRatios = isEvaluationTask ? referenceBoundaries : boundaries;
    const boundaryRecords = boundariesToRecords(chosenRatios, points);
    const previousBoundaryRecords = previousAnswer?.boundaries ?? [];
    const referenceRecords = boundariesToRecords(referenceBoundaries, points);
    const intervalRecords = isEvaluationTask
      ? []
      : intervalsToRecords(boundaries, boundaryHalfWidths, points);
    const localAnswer: LocalAnswer = {
      stimulusId,
      assetId: currentAsset.id,
      assetSymbol: currentAsset.symbol,
      assetOrder: assetCursor,
      disclosureLevel: level,
      disclosureKey: DISCLOSURES[level].key,
      boundaries: boundaryRecords,
      previousBoundaries: previousBoundaryRecords,
      referenceBoundaries: referenceRecords,
      boundaryIntervals: intervalRecords,
      reasonablenessRating: reasonableness,
      confidence,
      influenceRating: level === 0 ? null : influence,
      noChangeConfirmed,
      scaleMode,
      elapsedMs: now - stepStartedAt.current,
      adjustmentCount,
      uncertaintyAdjustmentCount,
      scaleSwitchCount,
    };
    try {
      const response = await fetch("/api/research-responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId,
          stimulusId,
          assetId: currentAsset.id,
          assetOrder: assetCursor,
          metricType: metric,
          taskMode,
          taskFamily: taskFamily(taskMode),
          resolution,
          scaleMode,
          disclosureLevel: level,
          disclosureKey: DISCLOSURES[level].key,
          boundaries: boundaryRecords,
          previousBoundaries: previousBoundaryRecords,
          referenceBoundaries: referenceRecords,
          boundaryIntervals: intervalRecords,
          reasonablenessRating: reasonableness,
          confidence,
          influenceRating: level === 0 ? null : influence,
          confidenceTouched: true,
          influenceTouched: level > 0,
          noChangeConfirmed,
          cueTags,
          rationale,
          elapsedMs: localAnswer.elapsedMs,
          revealReadMs: (firstInteractionAt ?? now) - stepStartedAt.current,
          firstMoveMs: firstMoveAt ? firstMoveAt - stepStartedAt.current : null,
          firstUncertaintyMs: firstUncertaintyAt
            ? firstUncertaintyAt - stepStartedAt.current
            : null,
          adjustmentCount,
          uncertaintyAdjustmentCount,
          scaleSwitchCount,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "本轮保存失败");
      setAnswers((current) => [...current, localAnswer]);
      if (level < DISCLOSURES.length - 1) {
        setPendingLevel(level + 1);
      } else {
        setPhase("reward");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "本轮保存失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  const revealNextLevel = () => {
    if (pendingLevel === null) return;
    setLevel(pendingLevel);
    setPendingLevel(null);
    resetStepFields();
  };

  const nextAsset = async () => {
    if (assetCursor + 1 < assetOrder.length) {
      setAssetCursor((value) => value + 1);
      setLevel(0);
      setBoundaries(
        isEvaluationTask ? [] : initialBoundaries(targetBoundaryCount),
      );
      setBoundaryHalfWidths(
        isEvaluationTask
          ? []
          : Array.from({ length: targetBoundaryCount }, () => null),
      );
      setScaleMode("linear");
      resetStepFields();
      setPhase("experiment");
      return;
    }
    try {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } finally {
      setPhase("complete");
    }
  };

  const downloadAnswers = () => {
    if (!bundle) return;
    const exportPayload = {
      protocolVersion: bundle.protocolVersion,
      sessionId,
      participantCode,
      config: {
        metric,
        taskMode,
        taskFamily: taskFamily(taskMode),
        targetBoundaryCount,
        resolution,
        actorType,
        expertise,
        modelName,
      },
      assetOrder: assetOrder.map((asset) => asset.id),
      answers,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boundary-lab-${sessionId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (phase === "setup") {
    return (
      <main className="research-shell research-setup-page">
        <header className="research-topbar">
          <Link href="/" className="research-brand" aria-label="Boundary Lab 首页">
            <span>BL</span>
            <div>
              <strong>Boundary Lab</strong>
              <small>CONTEXT ELASTICITY STUDY</small>
            </div>
          </Link>
          <div className="research-version-links">
            <span>研究平台 · 第三版</span>
            <a href="/v2">查看第二版</a>
            <a href="/legacy">原始版</a>
          </div>
        </header>

        <section className="research-hero">
          <div className="research-hero-copy">
            <span className="research-kicker">HUMAN × AGENT · STAGE PERCEPTION</span>
            <h1>
              同一条曲线，
              <br />
              <span>语义会让分界移动吗？</span>
            </h1>
            <p>
              在同一条曲线上逐层加入新的语义信息，记录同一个判断主体如何修正阶段边界；再系统比较人类与多模态 Agent 的“上下文弹性”。
            </p>
            <div className="research-hero-stats">
              <div><strong>3</strong><span>类曲线指标</span></div>
              <div><strong>6</strong><span>种判断条件</span></div>
              <div><strong>4</strong><span>级信息披露</span></div>
              <div><strong>2018–26</strong><span>最长观察期</span></div>
            </div>
          </div>
          <div className="research-hero-protocol">
            <div className="research-paper-label">固定披露顺序</div>
            <h2>信息一层层增加，曲线本身不变</h2>
            <div className="research-disclosure-preview">
              {DISCLOSURES.map((item, index) => (
                <div key={item.key} className={index > 0 ? "is-hidden" : ""}>
                  <span>{index === 0 ? item.step : "?"}</span>
                  <div>
                    <strong>{index === 0 ? item.title : "？"}</strong>
                    <small>{index === 0 ? item.description : "完成前一步后揭示"}</small>
                  </div>
                  {index < DISCLOSURES.length - 1 && <b>→</b>}
                </div>
              ))}
            </div>
            <p className="research-method-note">
              后续披露的主题会保持隐藏，直到上一轮提交。量表和分界范围均不预选默认值。
            </p>
          </div>
        </section>

        <section className="research-config" id="study-config">
          <div className="research-section-heading">
            <div>
              <span className="research-kicker">RESEARCH CONFIGURATION</span>
              <h2>先锁定本次研究条件</h2>
            </div>
            <p>条件在会话开始后不可更改，避免测试者在作答过程中混看不同刺激。</p>
          </div>

          <div className="research-config-block">
            <div className="research-config-index"><span>01</span><strong>选择曲线指标</strong></div>
            <div className="research-option-grid metric-options">
              {METRIC_OPTIONS.map((option) => {
                const selected = metric === option.key;
                const availableCount = availability
                  ? Math.max(...Object.values(availability[option.key]))
                  : 0;
                return (
                  <button
                    type="button"
                    key={option.key}
                    className={selected ? "is-selected" : ""}
                    onClick={() => selectMetric(option.key)}
                  >
                    <span className="research-option-number">{option.index}</span>
                    <small>{option.english}</small>
                    <strong>{option.title}</strong>
                    <p>{option.description}</p>
                    <em className={availableCount < 4 ? "is-limited" : ""}>
                      {bundle ? `${availableCount}/${bundle.assets.length} 条资产可用` : "正在核验数据…"}
                    </em>
                  </button>
                );
              })}
            </div>
            {metric === "activeAddresses" && (
              <div className="research-data-warning">
                <strong>数据完整性提示</strong>
                <span>
                  免费、同口径的 Coin Metrics AdrActCnt 当前只覆盖 BTC 与 ETH。SOL 与 BNB Smart Chain 不用替代口径或合成数据补齐，因此本条件包含 2 条曲线。
                </span>
              </div>
            )}
          </div>

          <div className="research-config-block">
            <div className="research-config-index"><span>02</span><strong>选择判断任务</strong></div>
            <div className="research-task-matrix">
              {TASK_GROUPS.map((group) => (
                <section key={group.family} className="research-task-row">
                  <div className="research-task-family">
                    <span>{group.index}</span>
                    <div>
                      <strong>{group.index} 类 · {group.title}</strong>
                      <small>{group.description}</small>
                    </div>
                  </div>
                  <div className="research-task-options" role="radiogroup" aria-label={`${group.index} 类任务`}>
                    {group.options.map((option) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={taskMode === option.key}
                        key={option.key}
                        className={taskMode === option.key ? "is-selected" : ""}
                        onClick={() => setTaskMode(option.key)}
                      >
                        <span>{group.index}{option.count}</span>
                        <div>
                          <strong>{option.title}</strong>
                          <small>{option.subtitle}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="research-config-two-column">
            <div className="research-config-block compact">
              <div className="research-config-index"><span>03</span><strong>选择时间分辨率</strong></div>
              <div className="research-resolution-picker" role="radiogroup" aria-label="时间分辨率">
                {(["daily", "weekly", "monthly", "yearly"] as Resolution[]).map((item) => {
                  const count = availability?.[metric][item] ?? 0;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={resolution === item}
                      disabled={count === 0}
                      className={resolution === item ? "is-selected" : ""}
                      key={item}
                      onClick={() => setResolution(item)}
                    >
                      <strong>{RESOLUTION_COPY[item].zh}</strong>
                      <small>{RESOLUTION_COPY[item].en}</small>
                      <em>{count ? `${count} 条` : "不可用"}</em>
                    </button>
                  );
                })}
              </div>
              {metric === "googleTrends" && (
                <p className="research-control-note">
                  2018–2026 长窗口没有一条原生日频序列；日频禁用，周频为冻结的基础序列。
                </p>
              )}
            </div>

            <div className="research-config-block compact">
              <div className="research-config-index"><span>04</span><strong>填写会话信息</strong></div>
              <div className="research-form-grid">
                <label>
                  <span>判断主体</span>
                  <select value={actorType} onChange={(event) => setActorType(event.target.value as "human" | "agent")}>
                    <option value="human">人类测试者</option>
                    <option value="agent">LLM / Agent</option>
                  </select>
                </label>
                <label>
                  <span>匿名编号（可留空）</span>
                  <input
                    value={participantCode}
                    maxLength={64}
                    onChange={(event) => setParticipantCode(event.target.value)}
                    placeholder="留空将自动生成"
                  />
                </label>
                <label>
                  <span>加密资产经验</span>
                  <select value={expertise} onChange={(event) => setExpertise(event.target.value)}>
                    <option value="none">没有相关经验</option>
                    <option value="casual">偶尔关注</option>
                    <option value="active">持续关注或交易</option>
                    <option value="professional">研究或从业经历</option>
                  </select>
                </label>
                {actorType === "agent" && (
                  <label>
                    <span>模型 / Agent 名称</span>
                    <input
                      value={modelName}
                      maxLength={120}
                      onChange={(event) => setModelName(event.target.value)}
                      placeholder="例如 GPT-5.6 / 自定义 Agent"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="research-lock-card">
            <div>
              <span className="research-eyebrow">本次将锁定</span>
              <strong>
                {METRIC_LABEL[metric]} · {TASK_LABEL[taskMode]} · {RESOLUTION_COPY[resolution].zh}频
              </strong>
              <p>
                {availability?.[metric][resolution] ?? 0} 条曲线，随机顺序；每条曲线作答 4 次。后续信息与可用控件只会在对应层级揭示。
              </p>
            </div>
            <label className="research-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>
                {actorType === "human"
                  ? "我已阅读预测试说明，自愿参加；不填写姓名等可识别信息。"
                  : "我确认 Agent 将按锁定条件完成全部步骤，不跨层调用未披露信息。"}
              </span>
            </label>
            {loadError && <p className="research-error">{loadError}</p>}
            {startError && <p className="research-error">{startError}</p>}
            <button
              type="button"
              className="research-primary-button"
              disabled={!bundle || !consent || (availability?.[metric][resolution] ?? 0) === 0}
              onClick={startStudy}
            >
              锁定条件，开始测试 <span>→</span>
            </button>
          </div>
        </section>

        <footer className="research-footer">
          <span>Boundary Lab · Context Elasticity Protocol</span>
          <span>预测试界面，不构成投资建议，也不假定存在唯一“正确”分期。</span>
        </footer>
      </main>
    );
  }

  if (!currentAsset || !currentMetric || !resolutionData) {
    return <main className="research-shell research-state-page"><p>研究刺激不可用，请返回重新配置。</p><Link href="/">返回首页</Link></main>;
  }

  if (phase === "reward") {
    const assetAnswers = answers.filter((answer) => answer.assetId === currentAsset.id);
    const first = assetAnswers[0];
    const last = assetAnswers[assetAnswers.length - 1];
    const boundaryMovement =
      first && last && !isEvaluationTask
        ? first.boundaries.reduce((total, boundary, index) => {
            const target = last.boundaries[index];
            return total + (target ? Math.abs(target.ratio - boundary.ratio) : 0);
          }, 0)
        : 0;
    return (
      <main className="research-shell research-reward-page">
        <header className="research-topbar compact">
          <div className="research-brand"><span>BL</span><div><strong>Boundary Lab</strong><small>ROUND REVIEW</small></div></div>
          <div className="research-session-chip">匿名会话 {sessionId.slice(0, 8)}</div>
        </header>
        <section className="research-reward-card">
          <div className="research-reward-heading">
            <span className="research-kicker">CURVE {assetCursor + 1} COMPLETE</span>
            <h1>{currentAsset.nameZh}：你的判断轨迹</h1>
            <p>这张图只反馈你刚才的选择，不评价对错。短暂查看后再进入下一条曲线。</p>
          </div>
          {isEvaluationTask ? (
            <div className="research-score-trajectory">
              <div className="research-score-axis"><span>5 合理</span><span>3 中间</span><span>1 不合理</span></div>
              <svg viewBox="0 0 800 260" role="img" aria-label="四级披露下的合理性评分轨迹">
                {[1, 2, 3, 4, 5].map((score) => <line key={score} x1="40" x2="760" y1={230 - (score - 1) * 48} y2={230 - (score - 1) * 48} />)}
                <polyline points={assetAnswers.map((answer, index) => `${80 + index * 220},${230 - ((answer.reasonablenessRating ?? 1) - 1) * 48}`).join(" ")} />
                {assetAnswers.map((answer, index) => (
                  <g key={answer.disclosureLevel}>
                    <circle cx={80 + index * 220} cy={230 - ((answer.reasonablenessRating ?? 1) - 1) * 48} r="10" />
                    <text x={80 + index * 220} y="254" textAnchor="middle">{DISCLOSURES[answer.disclosureLevel].short}</text>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div className="research-boundary-trajectory">
              <div className="research-trajectory-labels">
                {DISCLOSURES.map((item) => <span key={item.key}>{item.short}</span>)}
              </div>
              <svg viewBox="0 0 900 300" role="img" aria-label="四级披露下的分界点移动轨迹">
                {assetAnswers.map((answer, stepIndex) => (
                  <line key={`column-${stepIndex}`} x1={90 + stepIndex * 240} x2={90 + stepIndex * 240} y1="32" y2="262" className="trajectory-column" />
                ))}
                {Array.from({ length: 5 }, (_, boundaryIndex) => {
                  const samples = assetAnswers
                    .map((answer, stepIndex) => ({ answer, stepIndex, boundary: answer.boundaries[boundaryIndex] }))
                    .filter((sample) => sample.boundary);
                  if (!samples.length) return null;
                  return (
                    <g key={`track-${boundaryIndex}`} className={`trajectory-track track-${boundaryIndex}`}>
                      <polyline points={samples.map((sample) => `${90 + sample.stepIndex * 240},${42 + sample.boundary.ratio * 206}`).join(" ")} />
                      {samples.map((sample) => <circle key={sample.stepIndex} cx={90 + sample.stepIndex * 240} cy={42 + sample.boundary.ratio * 206} r="9" />)}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
          <div className="research-reward-stats">
            <div><span>最终信心</span><strong>{last?.confidence ?? "—"}<small>/5</small></strong></div>
            <div><span>{isEvaluationTask ? "合理性变化" : "累计边界位移"}</span><strong>{isEvaluationTask ? `${(last?.reasonablenessRating ?? 0) - (first?.reasonablenessRating ?? 0) >= 0 ? "+" : ""}${(last?.reasonablenessRating ?? 0) - (first?.reasonablenessRating ?? 0)}` : `${(boundaryMovement * 100).toFixed(1)}%`}</strong></div>
            <div><span>刻度切换</span><strong>{assetAnswers.reduce((sum, answer) => sum + answer.scaleSwitchCount, 0)}<small> 次</small></strong></div>
            <div><span>四步总用时</span><strong>{Math.round(assetAnswers.reduce((sum, answer) => sum + answer.elapsedMs, 0) / 1000)}<small> 秒</small></strong></div>
          </div>
          <button type="button" className="research-primary-button" onClick={nextAsset}>
            {assetCursor + 1 < assetOrder.length ? `进入下一条曲线（${assetCursor + 2}/${assetOrder.length}）` : "查看本次实验汇总"} <span>→</span>
          </button>
        </section>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <main className="research-shell research-complete-page">
        <header className="research-topbar compact">
          <div className="research-brand"><span>BL</span><div><strong>Boundary Lab</strong><small>SESSION COMPLETE</small></div></div>
          <div className="research-session-chip">{participantCode}</div>
        </header>
        <section className="research-complete-card">
          <span className="research-complete-mark">✓</span>
          <span className="research-kicker">ALL RESPONSES SAVED</span>
          <h1>本次判断已全部完成</h1>
          <p>服务器已保存 {answers.length} 条逐层记录。你可以下载自己的结构化副本；下载文件不包含姓名或联系方式。</p>
          <div className="research-complete-summary">
            <div><span>指标</span><strong>{METRIC_LABEL[metric]}</strong></div>
            <div><span>任务</span><strong>{TASK_LABEL[taskMode]}</strong></div>
            <div><span>分辨率</span><strong>{RESOLUTION_COPY[resolution].zh}频</strong></div>
            <div><span>曲线 × 披露</span><strong>{assetOrder.length} × 4</strong></div>
          </div>
          <div className="research-complete-actions">
            <button type="button" className="research-primary-button" onClick={downloadAnswers}>下载我的 JSON 记录 <span>↓</span></button>
            <Link href="/">开始新的实验条件</Link>
          </div>
          <small>会话 ID：{sessionId}</small>
        </section>
      </main>
    );
  }

  const sourceWindow = currentMetric.source.availableWindow as
    | { start?: string; end?: string }
    | undefined;

  return (
    <main className="research-shell research-experiment-page">
      <header className="research-topbar compact experiment-topbar">
        <div className="research-brand"><span>BL</span><div><strong>Boundary Lab</strong><small>LIVE RESEARCH SESSION</small></div></div>
        <div className="research-condition-strip">
          <span>{level >= 1 ? METRIC_LABEL[metric] : "指标：？"}</span>
          <b>·</b>
          <span>{TASK_LABEL[taskMode]}</span>
          <b>·</b>
          <span>{level >= 2 ? `${RESOLUTION_COPY[resolution].zh}频 🔒` : "分辨率：？"}</span>
        </div>
        <div className="research-session-progress">曲线 {assetCursor + 1}/{assetOrder.length} · 披露 {level + 1}/4</div>
      </header>

      <ProtocolRail level={level} />

      <div className="research-workspace">
        <section className="research-main-panel">
          <div className="research-chart-heading">
            <div>
              <span className="research-kicker">CURVE {String(assetCursor + 1).padStart(2, "0")} · DISCLOSURE {DISCLOSURES[level].step}</span>
              <h1>
                {level === 0
                  ? "一段匿名时间序列"
                  : `${currentAsset.nameZh}（${currentAsset.symbol}）· ${currentMetric.name}`}
              </h1>
              <p>
                {level === 0
                  ? "请只根据曲线形状完成当前任务。"
                  : level === 1
                    ? currentAsset.intro
                    : `${sourceWindow?.start ?? points[0].date} 至 ${sourceWindow?.end ?? points[points.length - 1].date}，${RESOLUTION_COPY[resolution].zh}频显示。`}
              </p>
            </div>
            <div className="research-chart-status">
              <span>{isEvaluationTask ? `预设 ${targetBoundaryCount} 个分界点 · ${targetBoundaryCount + 1} 阶段` : `固定 ${targetBoundaryCount} 个分界点`}</span>
              <small>{level >= 2 ? `${currentMetric.unit} · ${scaleMode === "log" ? "Log" : "Linear"}` : "数值暂未披露"}</small>
            </div>
          </div>

          {level >= 2 && (
            <div className="research-chart-toolbar is-new-information">
              <div>
                <span>时间分辨率</span>
                <div className="research-mini-segments">
                  {(["daily", "weekly", "monthly", "yearly"] as Resolution[]).map((item) => (
                    <button type="button" disabled key={item} className={resolution === item ? "is-selected" : ""}>{RESOLUTION_COPY[item].zh}</button>
                  ))}
                </div>
                <small>作为实验条件已锁定</small>
              </div>
              {metric === "price" && (
                <div>
                  <span>价格刻度 <em>本步解锁</em></span>
                  <div className="research-mini-segments interactive">
                    {(["linear", "log"] as ScaleMode[]).map((item) => (
                      <button
                        type="button"
                        key={item}
                        className={scaleMode === item ? "is-selected" : ""}
                        onClick={() => {
                          if (scaleMode !== item) {
                            setScaleMode(item);
                            setScaleSwitchCount((value) => value + 1);
                            markInteraction();
                          }
                        }}
                      >
                        {item === "linear" ? "正常价格" : "对数价格"}
                      </button>
                    ))}
                  </div>
                  <small>切换行为会被记录</small>
                </div>
              )}
            </div>
          )}

          <TrendChart
            points={points}
            metric={metric}
            resolution={resolution}
            scaleMode={scaleMode}
            disclosureLevel={level}
            boundaries={boundaries}
            boundaryHalfWidths={boundaryHalfWidths}
            previousBoundaries={level > 0 && !isEvaluationTask ? previousBoundaryRatios : []}
            referenceBoundaries={referenceBoundaries}
            taskMode={taskMode}
            events={currentAsset.events}
            onBoundariesChange={(values) => {
              setBoundaries(values);
              setNoChangeConfirmed(false);
            }}
            onInteraction={() => markInteraction(true)}
          />

          <BoundaryControls
            boundaries={boundaries}
            boundaryHalfWidths={boundaryHalfWidths}
            taskMode={taskMode}
            points={points}
            resolution={resolution}
            disclosureLevel={level}
            onChange={(values) => {
              setBoundaries(values);
              setNoChangeConfirmed(false);
            }}
            onHalfWidthsChange={(values) => {
              setBoundaryHalfWidths(values);
              setNoChangeConfirmed(false);
            }}
            onInteraction={() => markInteraction(true)}
            onUncertaintyInteraction={markUncertaintyInteraction}
          />
        </section>

        <aside className="research-response-panel">
          <section className="research-new-info-card">
            <div className="research-new-info-head"><span>这一步新增的信息</span><b>NEW</b></div>
            <h2>{DISCLOSURES[level].title}</h2>
            <p>{DISCLOSURES[level].description}</p>
            {level === 0 && <div className="research-reveal-detail"><strong>当前可见</strong><span>曲线形状、阶段分区与任务所需的分界点</span></div>}
            {level === 1 && (
              <div className="research-reveal-detail highlighted">
                <strong>{currentAsset.nameZh} · {currentMetric.name}</strong>
                <span>{currentAsset.intro}</span>
                <span>{currentMetric.definition}</span>
              </div>
            )}
            {level === 2 && (
              <div className="research-reveal-detail highlighted">
                <strong>{sourceWindow?.start ?? points[0].date} — {sourceWindow?.end ?? points[points.length - 1].date}</strong>
                <span>单位：{currentMetric.unit}；分辨率：{RESOLUTION_COPY[resolution].zh}频</span>
                <span>{metric === "price" ? "可在正常价格与对数价格之间切换。" : "数值轴现已显示真实单位。"}</span>
              </div>
            )}
            {level === 3 && (
              <div className="research-event-list">
                {currentAsset.events.map((event, index) => (
                  <details key={`${event.date}-${event.title}`}>
                    <summary><span>{index + 1}</span><div><strong>{event.title}</strong><small>{event.date}</small></div></summary>
                    <p>{event.description}</p>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section className="research-response-card">
            {isEvaluationTask && (
              <div className="research-question-block">
                <h3>你认为这套{targetBoundaryCount + 1}阶段划分合理吗？</h3>
                <RatingScale
                  value={reasonableness}
                  onChange={(value) => {
                    setReasonableness(value);
                    setNoChangeConfirmed(false);
                    markInteraction();
                  }}
                  leftLabel="非常不合理"
                  rightLabel="非常合理"
                  ariaLabel="预设阶段划分的合理程度"
                />
              </div>
            )}

            <div className="research-question-block">
              <h3>你对这次判断有多大信心？</h3>
              <RatingScale
                value={confidence}
                onChange={(value) => {
                  setConfidence(value);
                  markInteraction();
                }}
                leftLabel="很不确定"
                rightLabel="非常确定"
                ariaLabel="对本次判断的信心"
              />
            </div>

            {level > 0 && (
              <div className="research-question-block">
                <h3>这一步新增的信息，对你的判断影响有多大？</h3>
                <RatingScale
                  value={influence}
                  onChange={(value) => {
                    setInfluence(value);
                    markInteraction();
                  }}
                  leftLabel="几乎没有"
                  rightLabel="影响很大"
                  ariaLabel="新增信息的主观影响程度"
                />
              </div>
            )}

            {unchanged && (
              <label className="research-no-change">
                <input
                  type="checkbox"
                  checked={noChangeConfirmed}
                  onChange={(event) => setNoChangeConfirmed(event.target.checked)}
                />
                <span>
                  我确认本步仍维持上一轮的{isEvaluationTask ? "合理性判断" : "分界点与可能范围"}，并非漏答。
                </span>
              </label>
            )}

            <div className="research-question-block compact">
              <h3>这次判断主要参考了什么？ <small>可多选</small></h3>
              <div className="research-tag-grid">
                {CUE_TAGS.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    className={cueTags.includes(tag) ? "is-selected" : ""}
                    onClick={() => {
                      setCueTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
                      markInteraction();
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <label className="research-rationale">
              <span>还想补充什么？ <small>选填</small></span>
              <textarea
                value={rationale}
                maxLength={1000}
                onChange={(event) => setRationale(event.target.value)}
                placeholder="例如：我把长期横盘结束的位置看作一个新阶段……"
              />
              <em>{rationale.length}/1000</em>
            </label>

            {submitError && <p className="research-error">{submitError}</p>}
            <button
              type="button"
              className="research-primary-button submit-round"
              disabled={!responseComplete || submitting}
              onClick={submitResponse}
            >
              {submitting
                ? "正在保存…"
                : level < 3
                  ? "提交本轮，查看下一项信息"
                  : "提交本轮，查看回答轨迹"}
              <span>→</span>
            </button>
            <p className="research-submit-note">提交后不能返回修改本轮答案。</p>
          </section>
        </aside>
      </div>

      {pendingLevel !== null && (
        <div className="research-reveal-overlay" role="dialog" aria-modal="true" aria-labelledby="reveal-title">
          <div className="research-reveal-modal">
            <span className="research-reveal-step">信息披露 {DISCLOSURES[pendingLevel].step}/04</span>
            <div className="research-reveal-icon">＋</div>
            <span className="research-kicker">NEW CONTEXT UNLOCKED</span>
            <h2 id="reveal-title">接下来将新增：{DISCLOSURES[pendingLevel].title}</h2>
            <p>{DISCLOSURES[pendingLevel].description}</p>
            <button type="button" className="research-primary-button" onClick={revealNextLevel}>查看新增信息 <span>→</span></button>
            <small>曲线数据与上一轮相同；只有可见语义信息发生变化。</small>
          </div>
        </div>
      )}
    </main>
  );
}
