"use client";

import Link from "next/link";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type ModuleKey = "disclosure" | "framing" | "cross-series" | "robustness";
type TaskType = "T1" | "T2" | "T3";
type MetricKey = "price" | "activeAddresses" | "googleTrends";
type Resolution = "daily" | "weekly" | "monthly" | "yearly";
type ScaleMode = "linear" | "log";
type WindowMode = "whole" | "truncated";
type DisclosurePath = "general" | "domain" | "combined";
type DisclosureKey = "G0" | "GI1" | "GI2" | "DI1" | "DI2" | "DI3" | "DI4" | "FULL";
type RobustnessFactor = "resolution" | "scale" | "window" | "controls";
type Phase = "setup" | "experiment" | "review" | "complete";

type Point = { date: string; value: number };
type ResolutionData = {
  points: Point[];
  referenceBoundaries: number[];
  referenceBoundariesByCount: Record<string, number[]>;
};
type MetricData = {
  name: string;
  shortName?: string;
  unit: string;
  definition: string;
  available: boolean;
  unavailableReason?: string;
  source: Record<string, unknown>;
  resolutions: Partial<Record<Resolution, ResolutionData>>;
};
type EventAnnotation = {
  date: string;
  title: string;
  description: string;
  category: string;
  sourceUrl: string;
  priority: "high" | "low";
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
type ControlSeries = {
  id: string;
  kind: "cross-domain" | "null" | "ground-truth";
  name: string;
  nameZh: string;
  symbol: string;
  intro: string;
  metric: {
    key: "price";
    name: string;
    unit: string;
    definition: string;
    resolutions: Record<Resolution, ResolutionData>;
  };
  source: Record<string, unknown>;
  knownBoundaries: string[];
  events: EventAnnotation[];
};
type Bundle = {
  protocolVersion: string;
  requestedWindow: { start: string; end: string };
  assets: Asset[];
  controls: ControlSeries[];
};
type TrialPlan = {
  id: string;
  order: number;
  module: ModuleKey;
  taskType: TaskType;
  assetId: string;
  controlId?: string;
  metric: MetricKey;
  resolution: Resolution;
  scaleMode: ScaleMode;
  windowMode: WindowMode;
  disclosures: DisclosureKey[];
  variantLabel: string;
};
type BoundaryRecord = { index: number; ratio: number; date: string };
type IntervalRecord = {
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
type ModularAnswer = {
  trialId: string;
  trialOrder: number;
  disclosureIndex: number;
  disclosureKey: DisclosureKey;
  taskType: TaskType;
  assetId: string;
  metric: MetricKey;
  boundaries: BoundaryRecord[];
  previousBoundaries: BoundaryRecord[];
  boundaryIntervals: IntervalRecord[];
  singleStageConfirmed: boolean;
  confidence: number;
  influenceRating: number | null;
  elapsedMs: number;
};

const MODULES: Array<{
  key: ModuleKey;
  number: string;
  title: string;
  english: string;
  question: string;
  design: string;
}> = [
  {
    key: "disclosure",
    number: "M1",
    title: "信息披露主实验",
    english: "CONTEXT ELASTICITY",
    question: "同一个判断如何随一般信息与领域信息逐层修正？",
    design: "组内轨迹 · 多条资产曲线",
  },
  {
    key: "framing",
    number: "M2",
    title: "任务定义实验",
    english: "TASK FRAMING",
    question: "自由分期、固定三阶段与明确阶段定义会产生什么差异？",
    design: "T1 / T2 / T3 平衡顺序",
  },
  {
    key: "cross-series",
    number: "M3",
    title: "跨指标一致性",
    english: "CROSS-SERIES",
    question: "同一资产的价格、活跃地址与搜索热度是否共享阶段结构？",
    design: "同币种 · 三类序列",
  },
  {
    key: "robustness",
    number: "M4",
    title: "稳健性与对照",
    english: "ROBUSTNESS & CONTROLS",
    question: "分辨率、刻度、时间窗口与控制序列会怎样改变判断？",
    design: "单因素变动 · 负/正对照",
  },
];

const TASKS: Record<TaskType, { title: string; short: string; description: string }> = {
  T1: {
    title: "自由决定阶段数量",
    short: "任意阶段",
    description: "不提供阶段定义；可选择 1–6 个阶段，也可以判断整条曲线只有一个阶段。",
  },
  T2: {
    title: "固定划分为三个阶段",
    short: "三阶段",
    description: "设置两个分界点，但不提供“阶段”的具体定义。",
  },
  T3: {
    title: "按定义划分为三个阶段",
    short: "定义三阶段",
    description: "设置两个分界点，并使用统一的操作性阶段定义。",
  },
};

const STAGE_DEFINITION =
  "阶段是曲线在趋势方向、平均水平或波动结构上持续存在的相对稳定状态；短暂尖峰或单个异常点本身不足以构成独立阶段。";

const DISCLOSURE_COPY: Record<DisclosureKey, { title: string; short: string; description: string }> = {
  G0: { title: "匿名曲线", short: "基线", description: "只显示曲线形状与完成任务所需的控件。" },
  GI1: { title: "序列类型", short: "GI1", description: "披露这是价格、活跃地址或搜索热度序列。" },
  GI2: { title: "时间与单位", short: "GI2", description: "在序列类型基础上披露真实时间轴与数值单位。" },
  DI1: { title: "资产名称", short: "DI1", description: "只披露该加密资产的名称。" },
  DI2: { title: "资产基础介绍", short: "DI2", description: "在资产名称基础上增加一段中性背景。" },
  DI3: { title: "高优先级事件", short: "DI3", description: "增加预先编码的高优先级历史事件。" },
  DI4: { title: "低优先级事件", short: "DI4", description: "进一步增加低优先级历史事件。" },
  FULL: { title: "完整信息包", short: "FULL", description: "同时显示序列类型、坐标、资产背景与全部事件。" },
};

const DISCLOSURE_PATHS: Record<DisclosurePath, DisclosureKey[]> = {
  general: ["G0", "GI1", "GI2"],
  domain: ["G0", "DI1", "DI2", "DI3", "DI4"],
  combined: ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4"],
};

const SNAPSHOT_OPTIONS: DisclosureKey[] = ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"];
const METRIC_LABEL: Record<MetricKey, string> = {
  price: "价格数据",
  activeAddresses: "活跃地址",
  googleTrends: "Google Trends Index",
};
const RESOLUTION_LABEL: Record<Resolution, string> = {
  daily: "日频",
  weekly: "周频",
  monthly: "月频",
  yearly: "年频",
};
const CUES = ["趋势方向", "均值变化", "波动结构", "持续时间", "序列类型", "资产知识", "历史事件", "其他"];
const WIDTHS = [
  { value: 0.01, label: "很窄", width: "2%" },
  { value: 0.025, label: "较窄", width: "5%" },
  { value: 0.05, label: "中等", width: "10%" },
  { value: 0.08, label: "较宽", width: "16%" },
  { value: 0.12, label: "很宽", width: "24%" },
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function initialBoundaries(task: TaskType) {
  return task === "T1" ? [] : [1 / 3, 2 / 3];
}

function formatDate(value: string, resolution: Resolution) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (resolution === "yearly") return String(parsed.getUTCFullYear());
  if (resolution === "monthly") {
    return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
}

function formatValue(metric: MetricKey, value: number, unit: string) {
  if (metric === "price" && unit.toLowerCase().includes("usd")) {
    return value >= 1000 ? `$${Math.round(value).toLocaleString("en-US")}` : `$${value.toFixed(value < 10 ? 2 : 1)}`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(1);
}

function nearestIndex(points: Point[], dateValue: string) {
  const target = new Date(`${dateValue}T00:00:00Z`).getTime();
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const candidate = Math.abs(new Date(`${point.date}T00:00:00Z`).getTime() - target);
    if (candidate < distance) {
      best = index;
      distance = candidate;
    }
  });
  return best;
}

function boundaryRecords(values: number[], points: Point[]): BoundaryRecord[] {
  return [...values].sort((a, b) => a - b).map((ratio) => {
    const index = clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1);
    return { index, ratio: Number(ratio.toFixed(6)), date: points[index].date };
  });
}

function intervalRecords(values: number[], widths: Array<number | null>, points: Point[]): IntervalRecord[] {
  return values.flatMap((centerRatio, boundaryIndex) => {
    const halfWidthRatio = widths[boundaryIndex];
    if (halfWidthRatio === null || halfWidthRatio === undefined) return [];
    const lowerRatio = clamp(centerRatio - halfWidthRatio, 0, 1);
    const upperRatio = clamp(centerRatio + halfWidthRatio, 0, 1);
    const lowerIndex = clamp(Math.round(lowerRatio * (points.length - 1)), 0, points.length - 1);
    const upperIndex = clamp(Math.round(upperRatio * (points.length - 1)), 0, points.length - 1);
    return [{
      boundaryIndex,
      centerRatio: Number(centerRatio.toFixed(6)),
      halfWidthRatio,
      widthRatio: Number((upperRatio - lowerRatio).toFixed(6)),
      lowerRatio: Number(lowerRatio.toFixed(6)),
      upperRatio: Number(upperRatio.toFixed(6)),
      lowerIndex,
      upperIndex,
      lowerDate: points[lowerIndex].date,
      upperDate: points[upperIndex].date,
    }];
  });
}

function disclosureVisibility(key: DisclosureKey, path: DisclosurePath) {
  const domainLevel = key.startsWith("DI") ? Number(key.slice(2)) : 0;
  const combinedDomain = path === "combined" && domainLevel > 0;
  return {
    metric: key === "GI1" || key === "GI2" || key === "FULL" || combinedDomain,
    axes: key === "GI2" || key === "FULL" || combinedDomain,
    asset: domainLevel >= 1 || key === "FULL",
    intro: domainLevel >= 2 || key === "FULL",
    highEvents: domainLevel >= 3 || key === "FULL",
    lowEvents: domainLevel >= 4 || key === "FULL",
  };
}

function Rating({ value, onChange, left, right, label }: { value: number | null; onChange: (value: number) => void; left: string; right: string; label: string }) {
  return (
    <div className="mod-rating-wrap">
      <div className="mod-rating" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((option) => (
          <button type="button" role="radio" aria-checked={value === option} className={value === option ? "is-selected" : ""} key={option} onClick={() => onChange(option)}>{option}</button>
        ))}
      </div>
      <div className="mod-rating-labels"><span>{left}</span><span>{right}</span></div>
    </div>
  );
}

function eligibleAssets(bundle: Bundle, metric: MetricKey, resolution: Resolution) {
  return bundle.assets.filter((asset) => {
    const series = asset.metrics[metric];
    return series.available && Boolean(series.resolutions[resolution]?.points.length);
  });
}

function makeTrialPlan(
  bundle: Bundle,
  config: {
    module: ModuleKey;
    taskType: TaskType;
    metric: MetricKey;
    resolution: Resolution;
    scaleMode: ScaleMode;
    disclosurePath: DisclosurePath;
    snapshot: DisclosureKey;
    assetId: string;
    robustnessFactor: RobustnessFactor;
  },
): TrialPlan[] {
  const rows: Omit<TrialPlan, "id" | "order">[] = [];

  if (config.module === "disclosure") {
    shuffled(eligibleAssets(bundle, config.metric, config.resolution)).forEach((asset) => {
      rows.push({
        module: config.module,
        taskType: config.taskType,
        assetId: asset.id,
        metric: config.metric,
        resolution: config.resolution,
        scaleMode: config.metric === "price" ? config.scaleMode : "linear",
        windowMode: "whole",
        disclosures: DISCLOSURE_PATHS[config.disclosurePath],
        variantLabel: `${asset.symbol} · ${DISCLOSURE_PATHS[config.disclosurePath].length} 层披露`,
      });
    });
  }

  if (config.module === "framing") {
    const assets = shuffled(eligibleAssets(bundle, config.metric, config.resolution));
    shuffled<TaskType>(["T1", "T2", "T3"]).forEach((taskType, index) => {
      const asset = assets[index % assets.length];
      rows.push({
        module: config.module,
        taskType,
        assetId: asset.id,
        metric: config.metric,
        resolution: config.resolution,
        scaleMode: config.metric === "price" ? config.scaleMode : "linear",
        windowMode: "whole",
        disclosures: [config.snapshot],
        variantLabel: `${taskType} · ${TASKS[taskType].short}`,
      });
    });
  }

  if (config.module === "cross-series") {
    shuffled<MetricKey>(["price", "activeAddresses", "googleTrends"]).forEach((metric) => {
      rows.push({
        module: config.module,
        taskType: config.taskType,
        assetId: config.assetId,
        metric,
        resolution: config.resolution,
        scaleMode: metric === "price" ? config.scaleMode : "linear",
        windowMode: "whole",
        disclosures: [config.snapshot],
        variantLabel: METRIC_LABEL[metric],
      });
    });
  }

  if (config.module === "robustness") {
    if (config.robustnessFactor === "resolution") {
      shuffled<Resolution>(["daily", "weekly", "monthly", "yearly"]).forEach((resolution) => {
        rows.push({
          module: config.module,
          taskType: config.taskType,
          assetId: config.assetId,
          metric: "price",
          resolution,
          scaleMode: "linear",
          windowMode: "whole",
          disclosures: [config.snapshot],
          variantLabel: RESOLUTION_LABEL[resolution],
        });
      });
    }
    if (config.robustnessFactor === "scale") {
      shuffled<ScaleMode>(["linear", "log"]).forEach((scaleMode) => {
        rows.push({
          module: config.module,
          taskType: config.taskType,
          assetId: config.assetId,
          metric: "price",
          resolution: "weekly",
          scaleMode,
          windowMode: "whole",
          disclosures: [config.snapshot],
          variantLabel: scaleMode === "linear" ? "线性刻度" : "对数刻度",
        });
      });
    }
    if (config.robustnessFactor === "window") {
      shuffled<WindowMode>(["whole", "truncated"]).forEach((windowMode) => {
        rows.push({
          module: config.module,
          taskType: config.taskType,
          assetId: config.assetId,
          metric: "price",
          resolution: "weekly",
          scaleMode: "linear",
          windowMode,
          disclosures: [config.snapshot],
          variantLabel: windowMode === "whole" ? "完整时间窗" : "截短时间窗",
        });
      });
    }
    if (config.robustnessFactor === "controls") {
      const stimuli: Array<{ id: string; controlId?: string; label: string }> = [
        { id: config.assetId, label: "目标加密资产" },
        ...bundle.controls.map((control) => ({
          id: control.id,
          controlId: control.id,
          label:
            control.kind === "cross-domain"
              ? "跨领域对照"
              : control.kind === "null"
                ? "无结构负对照"
                : "已知结构正对照",
        })),
      ];
      shuffled(stimuli).forEach((stimulus) => {
        rows.push({
          module: config.module,
          taskType: config.taskType,
          assetId: stimulus.id,
          controlId: stimulus.controlId,
          metric: "price",
          resolution: "weekly",
          scaleMode: "linear",
          windowMode: "whole",
          disclosures: [config.snapshot],
          variantLabel: stimulus.label,
        });
      });
    }
  }

  return rows.map((row, order) => ({
    ...row,
    order,
    id: `${config.module}-${order + 1}-${row.assetId}-${row.metric}-${row.resolution}-${row.scaleMode}-${row.windowMode}`,
  }));
}

function DisclosureRail({
  keys,
  activeIndex,
}: {
  keys: DisclosureKey[];
  activeIndex: number;
}) {
  return (
    <section className="mod-disclosure-rail" aria-label="信息披露进度">
      {keys.map((key, index) => {
        const revealed = index <= activeIndex;
        const active = index === activeIndex;
        return (
          <div
            className={`mod-disclosure-step ${active ? "is-active" : ""} ${revealed ? "is-revealed" : "is-locked"}`}
            key={`${key}-${index}`}
          >
            <span className="mod-disclosure-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{revealed ? DISCLOSURE_COPY[key].title : "？"}</strong>
              <small>{revealed ? DISCLOSURE_COPY[key].description : "完成当前判断后揭示"}</small>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DisclosureSnapshot({ active }: { active: DisclosureKey }) {
  return (
    <section className="mod-disclosure-rail is-snapshot" aria-label="当前信息条件">
      <div className="mod-disclosure-step is-active is-revealed">
        <span className="mod-disclosure-number">{DISCLOSURE_COPY[active].short}</span>
        <div>
          <strong>{DISCLOSURE_COPY[active].title}</strong>
          <small>{DISCLOSURE_COPY[active].description}</small>
        </div>
      </div>
    </section>
  );
}

function ModularChart({
  points,
  metric,
  unit,
  resolution,
  scaleMode,
  visibility,
  boundaries,
  widths,
  previousBoundaries,
  events,
  taskType,
  onBoundariesChange,
  onBoundaryInteraction,
}: {
  points: Point[];
  metric: MetricKey;
  unit: string;
  resolution: Resolution;
  scaleMode: ScaleMode;
  visibility: ReturnType<typeof disclosureVisibility>;
  boundaries: number[];
  widths: Array<number | null>;
  previousBoundaries: number[];
  events: EventAnnotation[];
  taskType: TaskType;
  onBoundariesChange: (values: number[]) => void;
  onBoundaryInteraction: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const width = 1120;
  const height = 600;
  const margin = { top: 72, right: 28, bottom: visibility.axes ? 72 : 28, left: visibility.axes ? 88 : 28 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const rawValues = points.map((point) => point.value);
  const positiveFloor = Math.max(
    Number.MIN_VALUE,
    Math.min(...rawValues.filter((value) => value > 0)) * 0.5,
  );
  const transformValue = (value: number) =>
    scaleMode === "log" ? Math.log10(Math.max(value, positiveFloor)) : value;
  const transformed = rawValues.map(transformValue);
  const minimum = Math.min(...transformed);
  const maximum = Math.max(...transformed);
  const range = maximum - minimum || 1;
  const paddedMinimum = minimum - range * 0.05;
  const paddedMaximum = maximum + range * 0.05;
  const paddedRange = paddedMaximum - paddedMinimum;
  const xAt = (ratio: number) => margin.left + ratio * plotWidth;
  const yAt = (value: number) =>
    margin.top + (1 - (transformValue(value) - paddedMinimum) / paddedRange) * plotHeight;
  const path = points
    .map((point, index) => {
      const ratio = points.length <= 1 ? 0 : index / (points.length - 1);
      return `${index === 0 ? "M" : "L"}${xAt(ratio).toFixed(2)},${yAt(point.value).toFixed(2)}`;
    })
    .join(" ");
  const stageEdges = [0, ...boundaries, 1];
  const fills = ["#e8f0ec", "#f5efe0", "#f4e7e1", "#e6edf3", "#efe7f2", "#e8eee0"];
  const eventRows = events.map((event, index) => ({
    ...event,
    ratio: nearestIndex(points, event.date) / Math.max(1, points.length - 1),
    labelY: margin.top + 16 + (index % 3) * 28,
  }));

  const ratioFromEvent = useCallback(
    (clientX: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return 0.5;
      const svgX = ((clientX - rect.left) / rect.width) * width;
      return clamp((svgX - margin.left) / plotWidth, 0.015, 0.985);
    },
    [margin.left, plotWidth],
  );

  const updateBoundary = useCallback(
    (index: number, nextRatio: number) => {
      const lower = index === 0 ? 0.015 : boundaries[index - 1] + 0.02;
      const upper = index === boundaries.length - 1 ? 0.985 : boundaries[index + 1] - 0.02;
      const next = [...boundaries];
      next[index] = clamp(nextRatio, lower, upper);
      onBoundariesChange(next);
    },
    [boundaries, onBoundariesChange],
  );

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragIndex.current === null) return;
    updateBoundary(dragIndex.current, ratioFromEvent(event.clientX));
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragIndex.current !== null) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragIndex.current = null;
    }
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget && (event.target as Element).closest("[data-boundary-handle]")) return;
    const nextRatio = ratioFromEvent(event.clientX);
    if (taskType === "T1") {
      if (boundaries.length === 0) {
        onBoundaryInteraction();
        onBoundariesChange([nextRatio]);
        return;
      }
    }
    const closest = boundaries.reduce(
      (best, value, index) =>
        Math.abs(value - nextRatio) < best.distance ? { index, distance: Math.abs(value - nextRatio) } : best,
      { index: 0, distance: Number.POSITIVE_INFINITY },
    );
    onBoundaryInteraction();
    updateBoundary(closest.index, nextRatio);
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const transformedValue = paddedMinimum + ratio * paddedRange;
    const rawValue = scaleMode === "log" ? 10 ** transformedValue : transformedValue;
    return { ratio, value: rawValue, y: margin.top + (1 - ratio) * plotHeight };
  });
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    point: points[Math.round(ratio * (points.length - 1))],
    x: xAt(ratio),
  }));

  return (
    <div className="mod-chart-shell">
      <svg
        ref={svgRef}
        className="mod-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="用于阶段划分的交互式时间序列曲线"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <defs>
          <linearGradient id="mod-area-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#294f49" stopOpacity="0.23" />
            <stop offset="1" stopColor="#294f49" stopOpacity="0.015" />
          </linearGradient>
          <filter id="mod-line-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#153631" floodOpacity="0.13" />
          </filter>
          <clipPath id="mod-plot-clip">
            <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} rx="10" />
          </clipPath>
        </defs>

        <rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} rx="10" fill="#fbfaf5" />
        <g clipPath="url(#mod-plot-clip)">
          {stageEdges.slice(0, -1).map((edge, index) => (
            <rect
              key={`stage-${index}`}
              x={xAt(edge)}
              y={margin.top}
              width={xAt(stageEdges[index + 1]) - xAt(edge)}
              height={plotHeight}
              fill={fills[index % fills.length]}
              opacity="0.76"
            />
          ))}
          {visibility.axes && yTicks.map((tick) => (
            <line key={`grid-${tick.ratio}`} x1={margin.left} x2={width - margin.right} y1={tick.y} y2={tick.y} stroke="#193c36" strokeOpacity="0.09" strokeDasharray="4 7" />
          ))}
          {widths.map((halfWidth, index) => {
            if (halfWidth === null || boundaries[index] === undefined) return null;
            const left = clamp(boundaries[index] - halfWidth, 0, 1);
            const right = clamp(boundaries[index] + halfWidth, 0, 1);
            return <rect key={`band-${index}`} x={xAt(left)} y={margin.top} width={xAt(right) - xAt(left)} height={plotHeight} fill="#c96d45" opacity="0.16" />;
          })}
          <path d={`${path} L${xAt(1)},${margin.top + plotHeight} L${xAt(0)},${margin.top + plotHeight} Z`} fill="url(#mod-area-gradient)" />
          <path d={path} fill="none" stroke="#183f39" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" filter="url(#mod-line-shadow)" />

          {eventRows.map((event) => (
            <g key={`${event.date}-${event.title}`}>
              <line x1={xAt(event.ratio)} x2={xAt(event.ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke={event.priority === "high" ? "#c96d45" : "#738b86"} strokeWidth={event.priority === "high" ? 2 : 1.5} strokeDasharray={event.priority === "high" ? "5 5" : "3 7"} opacity="0.75" />
              <circle cx={xAt(event.ratio)} cy={event.labelY} r={event.priority === "high" ? 5 : 4} fill={event.priority === "high" ? "#c96d45" : "#738b86"} />
              <text x={xAt(event.ratio) + 8} y={event.labelY + 4} className="mod-event-label">{event.title.length > 13 ? `${event.title.slice(0, 13)}…` : event.title}</text>
            </g>
          ))}

          {previousBoundaries.map((ratio, index) => (
            <g key={`previous-${index}`}>
              <line x1={xAt(ratio)} x2={xAt(ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke="#c96d45" strokeWidth="3" strokeDasharray="8 8" opacity="0.92" />
              <rect x={xAt(ratio) - 40} y={margin.top + 9} width="80" height="25" rx="12.5" fill="#fff4ed" stroke="#c96d45" />
              <text x={xAt(ratio)} y={margin.top + 26} textAnchor="middle" className="mod-prior-label">上一步 {index + 1}</text>
            </g>
          ))}

          {boundaries.map((ratio, index) => (
            <g
              key={`boundary-${index}`}
              data-boundary-handle
              className="mod-boundary-handle"
              onPointerDown={(event) => {
                event.stopPropagation();
                dragIndex.current = index;
                event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                onBoundaryInteraction();
              }}
            >
              <line x1={xAt(ratio)} x2={xAt(ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke="#153832" strokeWidth="3" strokeDasharray="7 6" />
              <rect x={xAt(ratio) - 43} y={margin.top - 45} width="86" height="34" rx="17" fill="#153832" />
              <text x={xAt(ratio)} y={margin.top - 23} textAnchor="middle" className="mod-boundary-label">分界点 {index + 1}</text>
              <circle cx={xAt(ratio)} cy={margin.top + plotHeight * 0.54} r="18" fill="#fffdf8" stroke="#153832" strokeWidth="4" />
              <circle cx={xAt(ratio)} cy={margin.top + plotHeight * 0.54} r="4" fill="#153832" />
            </g>
          ))}
        </g>

        {visibility.axes && (
          <g className="mod-axis">
            {yTicks.map((tick) => (
              <text key={`ylabel-${tick.ratio}`} x={margin.left - 14} y={tick.y + 5} textAnchor="end">{formatValue(metric, tick.value, unit)}</text>
            ))}
            {xTicks.map((tick) => (
              <text key={`xlabel-${tick.ratio}`} x={tick.x} y={height - 28} textAnchor={tick.ratio === 0 ? "start" : tick.ratio === 1 ? "end" : "middle"}>{formatDate(tick.point.date, resolution)}</text>
            ))}
            <text x={margin.left + plotWidth / 2} y={height - 5} textAnchor="middle" className="mod-axis-title">真实时间 · {RESOLUTION_LABEL[resolution]}</text>
            <text transform={`translate(19 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" className="mod-axis-title">{unit}{scaleMode === "log" ? " · 对数刻度" : ""}</text>
          </g>
        )}
      </svg>
      <div className="mod-chart-footnote">
        <span>拖动分界线；点击曲线可快速移动最近的分界点</span>
        <span>{points.length.toLocaleString("zh-CN")} 个{RESOLUTION_LABEL[resolution]}观测值</span>
      </div>
    </div>
  );
}

function BoundaryEditor({
  taskType,
  boundaries,
  widths,
  points,
  singleStageConfirmed,
  onSingleStageConfirmed,
  onBoundariesChange,
  onWidthsChange,
  onBoundaryInteraction,
  onUncertaintyInteraction,
}: {
  taskType: TaskType;
  boundaries: number[];
  widths: Array<number | null>;
  points: Point[];
  singleStageConfirmed: boolean;
  onSingleStageConfirmed: (value: boolean) => void;
  onBoundariesChange: (values: number[]) => void;
  onWidthsChange: (values: Array<number | null>) => void;
  onBoundaryInteraction: () => void;
  onUncertaintyInteraction: () => void;
}) {
  const addBoundary = () => {
    if (boundaries.length >= 5) return;
    const ordered = boundaries
      .map((ratio, index) => ({ ratio, width: widths[index] ?? null }))
      .sort((first, second) => first.ratio - second.ratio);
    const edges = [0, ...ordered.map((item) => item.ratio), 1];
    let widestIndex = 0;
    let widestGap = -1;
    for (let index = 0; index < edges.length - 1; index += 1) {
      const gap = edges[index + 1] - edges[index];
      if (gap > widestGap) {
        widestGap = gap;
        widestIndex = index;
      }
    }
    const insertedRatio = (edges[widestIndex] + edges[widestIndex + 1]) / 2;
    const nextPairs = [...ordered, { ratio: insertedRatio, width: null }].sort(
      (first, second) => first.ratio - second.ratio,
    );
    onBoundaryInteraction();
    onSingleStageConfirmed(false);
    onBoundariesChange(nextPairs.map((item) => item.ratio));
    onWidthsChange(nextPairs.map((item) => item.width));
  };

  const removeBoundary = (index: number) => {
    onBoundaryInteraction();
    const nextBoundaries = boundaries.filter((_, candidate) => candidate !== index);
    const nextWidths = widths.filter((_, candidate) => candidate !== index);
    onBoundariesChange(nextBoundaries);
    onWidthsChange(nextWidths);
    onSingleStageConfirmed(false);
  };

  const updateSlider = (index: number, value: number) => {
    const lower = index === 0 ? 0.015 : boundaries[index - 1] + 0.02;
    const upper = index === boundaries.length - 1 ? 0.985 : boundaries[index + 1] - 0.02;
    const next = [...boundaries];
    next[index] = clamp(value, lower, upper);
    onBoundaryInteraction();
    onBoundariesChange(next);
  };

  return (
    <div className="mod-boundary-editor">
      <div className="mod-editor-heading">
        <div>
          <span className="mod-kicker">阶段结构</span>
          <h3>{taskType === "T1" ? `当前划分：${boundaries.length + 1} 个阶段` : "请设置两个分界点"}</h3>
        </div>
        {taskType === "T1" && (
          <button type="button" className="mod-small-action" onClick={addBoundary} disabled={boundaries.length >= 5}>＋ 增加分界点</button>
        )}
      </div>

      {taskType === "T1" && boundaries.length === 0 && (
        <div className="mod-confirm-row">
          <input id="mod-single-stage" type="checkbox" checked={singleStageConfirmed} onChange={(event) => onSingleStageConfirmed(event.target.checked)} />
          <label htmlFor="mod-single-stage"><strong>我判断整条曲线只有一个阶段</strong><small>如果你认为存在转折，请先增加分界点。</small></label>
        </div>
      )}

      {boundaries.map((ratio, index) => {
        const point = points[clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1)];
        return (
          <article className="mod-boundary-row" key={`editor-${index}`}>
            <div className="mod-boundary-row-head">
              <div><strong>分界点 {index + 1}</strong><span>{point?.date ?? "—"}</span></div>
              {taskType === "T1" && <button type="button" onClick={() => removeBoundary(index)} aria-label={`删除分界点 ${index + 1}`}>删除</button>}
            </div>
            <input
              aria-label={`调整分界点 ${index + 1}`}
              type="range"
              min="0.015"
              max="0.985"
              step={1 / Math.max(points.length - 1, 1000)}
              value={ratio}
              onChange={(event) => updateSlider(index, Number(event.target.value))}
            />
            <div className="mod-uncertainty-question">
              <span>你认为最佳分界线大致落在哪个范围？</span>
              <small>范围越宽，表示位置越不确定</small>
            </div>
            <div className="mod-width-options" role="radiogroup" aria-label={`分界点 ${index + 1} 的不确定范围`}>
              {WIDTHS.map((option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={widths[index] === option.value}
                  className={widths[index] === option.value ? "is-selected" : ""}
                  key={option.value}
                  onClick={() => {
                    const next = [...widths];
                    next[index] = option.value;
                    onUncertaintyInteraction();
                    onWidthsChange(next);
                  }}
                >
                  <i style={{ width: option.width }} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SetupChoice<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; title: string; description?: string; disabled?: boolean }>;
  label: string;
}) {
  return (
    <div className="mod-setup-choice" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          className={value === option.value ? "is-selected" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          <strong>{option.title}</strong>
          {option.description && <small>{option.description}</small>}
        </button>
      ))}
    </div>
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sameNumbers(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) < 0.00001);
}

export function ExperimentModular() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [moduleKey, setModuleKey] = useState<ModuleKey>("disclosure");
  const [taskType, setTaskType] = useState<TaskType>("T2");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [resolution, setResolution] = useState<Resolution>("weekly");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const [disclosurePath, setDisclosurePath] = useState<DisclosurePath>("combined");
  const [snapshot, setSnapshot] = useState<DisclosureKey>("GI2");
  const [assetId, setAssetId] = useState("bitcoin");
  const [robustnessFactor, setRobustnessFactor] = useState<RobustnessFactor>("resolution");
  const [actorType, setActorType] = useState<"human" | "agent">("human");
  const [participantCode, setParticipantCode] = useState("");
  const [expertise, setExpertise] = useState("none");
  const [modelName, setModelName] = useState("");
  const [consent, setConsent] = useState(false);
  const [plan, setPlan] = useState<TrialPlan[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [trialIndex, setTrialIndex] = useState(0);
  const [disclosureIndex, setDisclosureIndex] = useState(0);
  const [boundaries, setBoundaries] = useState<number[]>(initialBoundaries("T2"));
  const [widths, setWidths] = useState<Array<number | null>>([null, null]);
  const [singleStageConfirmed, setSingleStageConfirmed] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [confidenceTouched, setConfidenceTouched] = useState(false);
  const [influence, setInfluence] = useState(3);
  const [influenceTouched, setInfluenceTouched] = useState(false);
  const [noChangeConfirmed, setNoChangeConfirmed] = useState(false);
  const [cueTags, setCueTags] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");
  const [answers, setAnswers] = useState<ModularAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [uncertaintyAdjustmentCount, setUncertaintyAdjustmentCount] = useState(0);
  const stepStartedAt = useRef(0);
  const firstMoveAt = useRef<number | null>(null);
  const firstUncertaintyAt = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/research-stimuli-modular-v6.json")
      .then((response) => {
        if (!response.ok) throw new Error("研究刺激数据加载失败");
        return response.json() as Promise<Bundle>;
      })
      .then((payload) => {
        if (!cancelled) setBundle(payload);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setLoadError(reason instanceof Error ? reason.message : "研究刺激数据加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== "experiment") return;
    stepStartedAt.current = performance.now();
    firstMoveAt.current = null;
    firstUncertaintyAt.current = null;
  }, [phase, trialIndex, disclosureIndex]);

  const currentTrial = plan[trialIndex];
  const currentDisclosure = currentTrial?.disclosures[disclosureIndex];
  const currentAsset = bundle?.assets.find((asset) => asset.id === currentTrial?.assetId);
  const currentControl = bundle?.controls.find((control) => control.id === currentTrial?.controlId);
  const currentMetric = currentControl
    ? {
        name: currentControl.metric.name,
        unit: currentControl.metric.unit,
        definition: currentControl.metric.definition,
        resolutions: currentControl.metric.resolutions,
      }
    : currentAsset?.metrics[currentTrial?.metric ?? "price"];
  const fullResolutionData = currentMetric?.resolutions[currentTrial?.resolution ?? "weekly"];
  const sourcePoints = fullResolutionData?.points ?? [];
  const truncatedStart = Math.floor(sourcePoints.length * 0.27);
  const truncatedEnd = Math.max(truncatedStart + 4, Math.ceil(sourcePoints.length * 0.78));
  const points = currentTrial?.windowMode === "truncated"
    ? sourcePoints.slice(truncatedStart, truncatedEnd)
    : sourcePoints;
  const previousAnswer = answers
    .filter((answer) => answer.trialId === currentTrial?.id)
    .sort((a, b) => b.disclosureIndex - a.disclosureIndex)[0];
  const previousRatios = previousAnswer?.boundaries.map((boundary) => boundary.ratio) ?? [];
  const visibility = currentDisclosure
    ? disclosureVisibility(
        currentDisclosure,
        currentTrial?.module === "disclosure" ? disclosurePath : "domain",
      )
    : disclosureVisibility("G0", "domain");
  const allEvents = currentControl?.events ?? currentAsset?.events ?? [];
  const visibleEvents = allEvents.filter((event) => {
    if (!points.length || event.date < points[0].date || event.date > points[points.length - 1].date) return false;
    return (visibility.highEvents && event.priority === "high") || (visibility.lowEvents && event.priority === "low");
  });
  const displayName = currentControl?.nameZh ?? currentAsset?.nameZh ?? "匿名序列";
  const displaySymbol = currentControl?.symbol ?? currentAsset?.symbol ?? "";
  const displayIntro = currentControl?.intro ?? currentAsset?.intro ?? "";

  const markBoundaryInteraction = () => {
    const now = performance.now();
    if (firstMoveAt.current === null) firstMoveAt.current = now;
    setAdjustmentCount((value) => value + 1);
    setNoChangeConfirmed(false);
  };

  const markUncertaintyInteraction = () => {
    const now = performance.now();
    if (firstUncertaintyAt.current === null) firstUncertaintyAt.current = now;
    setUncertaintyAdjustmentCount((value) => value + 1);
    setNoChangeConfirmed(false);
  };

  const resetResponseState = (nextTask: TaskType, preserve = false) => {
    const nextBoundaries = preserve ? boundaries : initialBoundaries(nextTask);
    setBoundaries(nextBoundaries);
    setWidths(preserve ? widths : Array(nextBoundaries.length).fill(null));
    setSingleStageConfirmed(preserve ? singleStageConfirmed : false);
    setConfidence(3);
    setConfidenceTouched(false);
    setInfluence(3);
    setInfluenceTouched(false);
    setNoChangeConfirmed(false);
    setCueTags([]);
    setRationale("");
    setAdjustmentCount(0);
    setUncertaintyAdjustmentCount(0);
    setError("");
    firstMoveAt.current = null;
    firstUncertaintyAt.current = null;
  };

  const begin = async () => {
    if (!bundle || !consent) return;
    setBusy(true);
    setError("");
    try {
      const nextPlan = makeTrialPlan(bundle, {
        module: moduleKey,
        taskType,
        metric,
        resolution,
        scaleMode,
        disclosurePath,
        snapshot,
        assetId,
        robustnessFactor,
      });
      if (!nextPlan.length) throw new Error("当前条件没有可用曲线，请调整研究配置。");
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType,
          participantCode,
          expertise,
          experimentalArm: moduleKey,
          protocolVersion: bundle.protocolVersion,
          modelName: actorType === "agent" ? modelName : null,
          studyConfig: {
            module: moduleKey,
            taskType,
            metric,
            resolution,
            scaleMode,
            disclosurePath,
            snapshot,
            assetId,
            robustnessFactor,
            randomizedPlan: nextPlan,
          },
        }),
      });
      const payload = (await response.json()) as { session?: { id: string }; error?: string };
      if (!response.ok || !payload.session?.id) throw new Error(payload.error ?? "实验会话创建失败");
      setSessionId(payload.session.id);
      setPlan(nextPlan);
      setTrialIndex(0);
      setDisclosureIndex(0);
      setAnswers([]);
      resetResponseState(nextPlan[0].taskType, false);
      setPhase("experiment");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "实验启动失败");
    } finally {
      setBusy(false);
    }
  };

  const submitResponse = async (submitTimestamp: number) => {
    if (!bundle || !currentTrial || !currentDisclosure || !points.length || !sessionId) return;
    const orderedBoundaries = [...boundaries].sort((a, b) => a - b);
    const orderedWidths = orderedBoundaries.map((boundary) => widths[boundaries.indexOf(boundary)] ?? null);
    const currentBoundaryRecords = boundaryRecords(orderedBoundaries, points);
    const currentIntervalRecords = intervalRecords(orderedBoundaries, orderedWidths, points);
    if (currentTrial.taskType === "T1") {
      if (orderedBoundaries.length === 0 && !singleStageConfirmed) {
        setError("请确认整条曲线只有一个阶段，或增加至少一个分界点。");
        return;
      }
      if (orderedBoundaries.length > 5) {
        setError("自由分期最多允许五个分界点（六个阶段）。");
        return;
      }
    } else if (orderedBoundaries.length !== 2) {
      setError("当前任务需要恰好两个分界点。");
      return;
    }
    if (orderedBoundaries.length > 0 && currentIntervalRecords.length !== orderedBoundaries.length) {
      setError("请为每个分界点选择一个大致的不确定范围。");
      return;
    }
    const sameAsPrevious = previousAnswer
      ? sameNumbers(orderedBoundaries, previousRatios) &&
        orderedWidths.length === previousAnswer.boundaryIntervals.length &&
        orderedWidths.every((value, index) => value === previousAnswer.boundaryIntervals[index]?.halfWidthRatio)
      : false;
    if (currentTrial.module === "disclosure" && disclosureIndex > 0 && sameAsPrevious && !noChangeConfirmed) {
      setError("本步分界点与范围均未改变。请确认这是有意保持不变，或继续调整。");
      return;
    }

    setBusy(true);
    setError("");
    const now = submitTimestamp;
    const elapsedMs = Math.max(0, Math.round(now - stepStartedAt.current));
    const stimulusType = currentControl?.kind ?? "crypto";
    const disclosureState = {
      key: currentDisclosure,
      path: currentTrial.module === "disclosure" ? disclosurePath : "snapshot",
      visibility,
      visibleEventPriorities: [
        ...(visibility.highEvents ? ["high"] : []),
        ...(visibility.lowEvents ? ["low"] : []),
      ],
    };
    try {
      const response = await fetch("/api/modular-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          trialId: currentTrial.id,
          trialOrder: currentTrial.order,
          moduleKey: currentTrial.module,
          taskType: currentTrial.taskType,
          stimulusType,
          assetId: currentTrial.assetId,
          metricType: currentTrial.metric,
          resolution: currentTrial.resolution,
          scaleMode: currentTrial.scaleMode,
          windowMode: currentTrial.windowMode,
          disclosureIndex,
          disclosureKey: currentDisclosure,
          disclosureState,
          boundaries: currentBoundaryRecords,
          previousBoundaries: previousAnswer?.boundaries ?? [],
          boundaryIntervals: currentIntervalRecords,
          singleStageConfirmed,
          confidence,
          confidenceTouched,
          influenceRating: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influence : null,
          influenceTouched: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influenceTouched : false,
          noChangeConfirmed,
          cueTags,
          rationale,
          elapsedMs,
          revealReadMs: Math.round((firstMoveAt.current ?? firstUncertaintyAt.current ?? now) - stepStartedAt.current),
          firstMoveMs: firstMoveAt.current === null ? null : Math.round(firstMoveAt.current - stepStartedAt.current),
          firstUncertaintyMs: firstUncertaintyAt.current === null ? null : Math.round(firstUncertaintyAt.current - stepStartedAt.current),
          adjustmentCount,
          uncertaintyAdjustmentCount,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "本轮记录失败");
      const answer: ModularAnswer = {
        trialId: currentTrial.id,
        trialOrder: currentTrial.order,
        disclosureIndex,
        disclosureKey: currentDisclosure,
        taskType: currentTrial.taskType,
        assetId: currentTrial.assetId,
        metric: currentTrial.metric,
        boundaries: currentBoundaryRecords,
        previousBoundaries: previousAnswer?.boundaries ?? [],
        boundaryIntervals: currentIntervalRecords,
        singleStageConfirmed,
        confidence,
        influenceRating: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influence : null,
        elapsedMs,
      };
      setAnswers((value) => [...value, answer]);
      if (disclosureIndex < currentTrial.disclosures.length - 1) {
        setDisclosureIndex((value) => value + 1);
        resetResponseState(currentTrial.taskType, true);
      } else {
        setPhase("review");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "本轮记录失败");
    } finally {
      setBusy(false);
    }
  };

  const continueAfterReview = async () => {
    if (trialIndex < plan.length - 1) {
      const nextIndex = trialIndex + 1;
      setTrialIndex(nextIndex);
      setDisclosureIndex(0);
      resetResponseState(plan[nextIndex].taskType, false);
      setPhase("experiment");
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } finally {
      setBusy(false);
      setPhase("complete");
    }
  };

  const moduleInfo = MODULES.find((item) => item.key === moduleKey) ?? MODULES[0];

  if (phase === "setup") {
    const snapshotOptions = moduleKey === "robustness" ? SNAPSHOT_OPTIONS.slice(0, 3) : SNAPSHOT_OPTIONS;
    return (
      <main className="mod-site">
        <header className="mod-topbar">
          <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>06</b></Link>
          <nav aria-label="版本入口">
            <a href="#modules">实验模块</a>
            <a href="#configure">配置研究</a>
            <Link href="/v3-revised">保留的 V3 修订版</Link>
          </nav>
        </header>

        <section className="mod-hero">
          <div className="mod-hero-copy">
            <span className="mod-eyebrow">MODULAR EXPERIMENT PLATFORM · 2026</span>
            <h1>把一个问题，<br />拆成四组可检验的实验。</h1>
            <p>研究人类与 Agent 如何理解时间序列中的“阶段”，以及这种判断会如何被上下文、任务定义、指标类型和图表形式改变。</p>
            <a className="mod-primary-link" href="#modules">选择实验模块 <span>↓</span></a>
          </div>
          <div className="mod-hero-diagram" aria-hidden="true">
            <div className="mod-orbit is-one"><span>M1</span><i /></div>
            <div className="mod-orbit is-two"><span>M2</span><i /></div>
            <div className="mod-orbit is-three"><span>M3</span><i /></div>
            <div className="mod-orbit is-four"><span>M4</span><i /></div>
            <div className="mod-orbit-center"><small>RESEARCH<br />OBJECT</small><strong>阶段<br />判断</strong></div>
          </div>
        </section>

        <section className="mod-module-section" id="modules">
          <div className="mod-section-heading">
            <span className="mod-index">01</span>
            <div><span className="mod-eyebrow">EXPERIMENTAL MODULES</span><h2>选择本次要隔离的研究问题</h2></div>
            <p>每次会话只运行一个模块，减少疲劳，也避免不同操纵相互污染。</p>
          </div>
          <div className="mod-module-grid">
            {MODULES.map((item) => (
              <button
                type="button"
                className={`mod-module-card ${moduleKey === item.key ? "is-selected" : ""}`}
                key={item.key}
                onClick={() => {
                  setModuleKey(item.key);
                  if (item.key === "cross-series") {
                    if (!["bitcoin", "ethereum"].includes(assetId)) setAssetId("bitcoin");
                    if (resolution === "daily") setResolution("weekly");
                  }
                  if (item.key === "robustness" && !["G0", "GI1", "GI2"].includes(snapshot)) setSnapshot("GI2");
                }}
              >
                <span className="mod-card-number">{item.number}</span>
                <small>{item.english}</small>
                <h3>{item.title}</h3>
                <p>{item.question}</p>
                <footer><span>{item.design}</span><b>{moduleKey === item.key ? "已选择" : "选择 →"}</b></footer>
              </button>
            ))}
          </div>
        </section>

        <section className="mod-config-section" id="configure">
          <div className="mod-section-heading">
            <span className="mod-index">02</span>
            <div><span className="mod-eyebrow">STUDY CONFIGURATION</span><h2>{moduleInfo.number} · {moduleInfo.title}</h2></div>
            <p>{moduleInfo.question}</p>
          </div>

          <div className="mod-config-grid">
            <section className="mod-config-main">
              {(moduleKey === "disclosure" || moduleKey === "cross-series" || moduleKey === "robustness") && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>01</span><div><strong>判断任务</strong><small>分界点数量与阶段定义在试次开始前固定</small></div></div>
                  <SetupChoice
                    label="判断任务"
                    value={taskType}
                    onChange={setTaskType}
                    options={(["T1", "T2", "T3"] as TaskType[]).map((value) => ({ value, title: `${value} · ${TASKS[value].short}`, description: TASKS[value].description }))}
                  />
                </div>
              )}

              {moduleKey === "framing" && (
                <div className="mod-protocol-note"><span>T1 → T2 → T3</span><div><strong>系统会自动平衡三种任务的顺序</strong><p>每种任务使用不同的随机资产；本页只固定其余条件。</p></div></div>
              )}

              {(moduleKey === "disclosure" || moduleKey === "framing") && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>02</span><div><strong>序列类型</strong><small>选择用于本次模块的曲线指标</small></div></div>
                  <SetupChoice
                    label="序列类型"
                    value={metric}
                    onChange={(value) => {
                      setMetric(value);
                      if (value === "googleTrends" && resolution === "daily") setResolution("weekly");
                      if (value !== "price") setScaleMode("linear");
                    }}
                    options={([
                      ["price", "价格数据", "美元计价的市场价格"],
                      ["activeAddresses", "Active addresses", "链上日活跃地址数量"],
                      ["googleTrends", "Google Trend index", "标准化搜索热度指数"],
                    ] as const).map(([value, title, description]) => ({ value, title, description }))}
                  />
                </div>
              )}

              {moduleKey === "cross-series" && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>02</span><div><strong>目标资产</strong><small>三个指标必须在同一资产、同一时间范围下比较</small></div></div>
                  <SetupChoice
                    label="目标资产"
                    value={assetId}
                    onChange={setAssetId}
                    options={(bundle?.assets ?? []).filter((asset) => ["bitcoin", "ethereum"].includes(asset.id)).map((asset) => ({ value: asset.id, title: `${asset.nameZh} · ${asset.symbol}`, description: "价格 / 活跃地址 / 搜索热度均可用" }))}
                  />
                </div>
              )}

              {moduleKey === "robustness" && (
                <>
                  <div className="mod-fieldset">
                    <div className="mod-field-label"><span>02</span><div><strong>稳健性因素</strong><small>一次只改变一个因素，避免不可识别的交互</small></div></div>
                    <SetupChoice
                      label="稳健性因素"
                      value={robustnessFactor}
                      onChange={setRobustnessFactor}
                      options={[
                        { value: "resolution", title: "Resolution", description: "日 / 周 / 月 / 年频率" },
                        { value: "scale", title: "Scale mode", description: "线性 / 对数刻度" },
                        { value: "window", title: "Time window", description: "完整 / 截短时间窗" },
                        { value: "controls", title: "Control series", description: "目标、跨域、负对照、正对照" },
                      ]}
                    />
                  </div>
                  <div className="mod-fieldset">
                    <div className="mod-field-label"><span>03</span><div><strong>目标资产</strong><small>控制条件之外的基准加密资产</small></div></div>
                    <SetupChoice
                      label="目标资产"
                      value={assetId}
                      onChange={setAssetId}
                      options={(bundle?.assets ?? []).map((asset) => ({ value: asset.id, title: `${asset.nameZh} · ${asset.symbol}` }))}
                    />
                  </div>
                </>
              )}

              {moduleKey === "disclosure" && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>03</span><div><strong>披露路径</strong><small>同一曲线内逐层累积，不提前显示后续内容</small></div></div>
                  <SetupChoice
                    label="披露路径"
                    value={disclosurePath}
                    onChange={setDisclosurePath}
                    options={[
                      { value: "general", title: "一般信息 GI", description: "G0 → 类型 → 时间与单位" },
                      { value: "domain", title: "领域信息 DI", description: "G0 → 币名 → 背景 → 高/低优先事件" },
                      { value: "combined", title: "组合路径", description: "先一般信息，再累积领域信息" },
                    ]}
                  />
                </div>
              )}

              {moduleKey !== "disclosure" && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>{moduleKey === "robustness" ? "04" : "03"}</span><div><strong>固定信息快照</strong><small>所有试次使用完全相同的信息条件</small></div></div>
                  <SetupChoice
                    label="固定信息快照"
                    value={snapshot}
                    onChange={setSnapshot}
                    options={snapshotOptions.map((value) => ({ value, title: `${DISCLOSURE_COPY[value].short} · ${DISCLOSURE_COPY[value].title}`, description: DISCLOSURE_COPY[value].description }))}
                  />
                </div>
              )}

              {moduleKey !== "robustness" && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>04</span><div><strong>图表条件</strong><small>在模块内部保持不变</small></div></div>
                  <div className="mod-inline-fields">
                    <label><span>Resolution</span><select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}><option value="daily" disabled={metric === "googleTrends" || moduleKey === "cross-series"}>Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>
                    <label><span>Scale</span><select value={scaleMode} disabled={metric !== "price" && moduleKey !== "cross-series"} onChange={(event) => setScaleMode(event.target.value as ScaleMode)}><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
                  </div>
                </div>
              )}
            </section>

            <aside className="mod-config-summary">
              <span className="mod-eyebrow">SESSION CARD</span>
              <h3>{moduleInfo.number}<br />{moduleInfo.english}</h3>
              <dl>
                <div><dt>主要比较</dt><dd>{moduleInfo.design}</dd></div>
                <div><dt>预计试次</dt><dd>{moduleKey === "disclosure" ? `${eligibleAssets(bundle ?? { assets: [], controls: [], protocolVersion: "", requestedWindow: { start: "", end: "" } }, metric, resolution).length} 条曲线 × ${DISCLOSURE_PATHS[disclosurePath].length} 层` : moduleKey === "framing" || moduleKey === "cross-series" ? "3 条曲线" : robustnessFactor === "scale" || robustnessFactor === "window" ? "2 条曲线" : "4 条曲线"}</dd></div>
                <div><dt>时间范围</dt><dd>2018—2026</dd></div>
                <div><dt>提交规则</dt><dd>每个判断单独写入数据库</dd></div>
              </dl>
              <p>系统会把随机顺序、信息状态、分界点、范围、评分和交互时间完整写入会话配置与响应表。</p>
            </aside>
          </div>

          <section className="mod-participant-card">
            <div className="mod-field-label"><span>03</span><div><strong>参与者与知情同意</strong><small>用于区分人类与 Agent 样本；不采集真实姓名</small></div></div>
            <div className="mod-participant-grid">
              <label><span>判断主体</span><select value={actorType} onChange={(event) => setActorType(event.target.value as "human" | "agent")}><option value="human">人类测试者</option><option value="agent">LLM / Agent</option></select></label>
              <label><span>匿名编号（可选）</span><input value={participantCode} maxLength={64} onChange={(event) => setParticipantCode(event.target.value)} placeholder="例如 P-001" /></label>
              {actorType === "human" ? (
                <label><span>相关经验</span><select value={expertise} onChange={(event) => setExpertise(event.target.value)}><option value="none">无相关经验</option><option value="casual">偶尔关注</option><option value="active">持续参与</option><option value="professional">专业研究/从业</option></select></label>
              ) : (
                <label><span>模型/Agent 名称</span><input value={modelName} maxLength={120} onChange={(event) => setModelName(event.target.value)} placeholder="例如 GPT-5.6" /></label>
              )}
            </div>
            <label className="mod-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我已了解：每次提交后不能返回修改；研究会记录判断结果与交互时间，但不要求提供真实身份。</span></label>
            {(loadError || error) && <p className="mod-error" role="alert">{loadError || error}</p>}
            <button className="mod-start" type="button" onClick={begin} disabled={!bundle || !consent || busy || Boolean(loadError)}>{busy ? "正在建立随机实验序列…" : `开始 ${moduleInfo.number} 实验`}<span>→</span></button>
          </section>
        </section>

        <footer className="mod-footer"><span>BOUNDARY LAB · MODULAR PROTOCOL V6</span><span>V3 修订版已保留，可随时回退</span></footer>
      </main>
    );
  }

  if (!bundle || !currentTrial || !currentDisclosure || !currentMetric || !points.length) {
    return <main className="mod-site mod-centered"><p>实验条件无法载入。请刷新页面后重试。</p></main>;
  }

  const trialAnswers = answers.filter((answer) => answer.trialId === currentTrial.id);
  const currentModule = MODULES.find((item) => item.key === currentTrial.module) ?? MODULES[0];
  const movement = trialAnswers.length > 1
    ? trialAnswers.slice(1).reduce((sum, answer) => {
        const matched = Math.min(answer.boundaries.length, answer.previousBoundaries.length);
        return sum + answer.boundaries.slice(0, matched).reduce((inner, boundary, index) => inner + Math.abs(boundary.ratio - answer.previousBoundaries[index].ratio), 0);
      }, 0)
    : 0;
  const averageRange = trialAnswers.length
    ? trialAnswers.reduce((sum, answer) => sum + answer.boundaryIntervals.reduce((inner, interval) => inner + interval.widthRatio, 0), 0) /
      Math.max(1, trialAnswers.reduce((sum, answer) => sum + answer.boundaryIntervals.length, 0))
    : 0;

  if (phase === "review") {
    const first = trialAnswers[0];
    const last = trialAnswers[trialAnswers.length - 1];
    return (
      <main className="mod-site mod-review-page">
        <header className="mod-topbar"><span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>06</b></span><span>{currentModule.number} · 试次 {trialIndex + 1}/{plan.length}</span></header>
        <section className="mod-review-hero">
          <span className="mod-eyebrow">MICRO REWARD · 本轮反馈</span>
          <h1>你刚刚留下了一条<br />可测量的判断轨迹。</h1>
          <p>这不是标准答案评分；它只把你在本轮中的阶段结构、上下文修正和不确定性可视化。</p>
        </section>
        <section className="mod-review-grid">
          <article className="mod-review-chart">
            <div className="mod-review-title"><span>边界轨迹</span><strong>{trialAnswers.length} 次判断</strong></div>
            <div className="mod-track">
              {trialAnswers.map((answer) => (
                <div className="mod-track-row" key={`${answer.trialId}-${answer.disclosureIndex}`}>
                  <span>{DISCLOSURE_COPY[answer.disclosureKey].short}</span>
                  <div>{answer.boundaries.map((boundary, boundaryIndex) => <i key={boundaryIndex} style={{ left: `${boundary.ratio * 100}%` }}><b>{boundaryIndex + 1}</b></i>)}</div>
                </div>
              ))}
            </div>
          </article>
          <article className="mod-review-stat is-dark"><small>累计边界位移</small><strong>{(movement * 100).toFixed(1)}<em>% 时间窗</em></strong><p>{trialAnswers.length > 1 ? "反映逐层信息带来的总修正幅度" : "该模块采用固定信息快照，因此没有层间位移"}</p></article>
          <article className="mod-review-stat"><small>平均不确定范围</small><strong>{(averageRange * 100).toFixed(1)}<em>% 时间窗</em></strong><p>范围越宽，表示你对精确边界位置保留越多余量</p></article>
          <article className="mod-review-stat"><small>阶段数量</small><strong>{(last?.boundaries.length ?? first?.boundaries.length ?? 0) + 1}<em> 个阶段</em></strong><p>{first && last && first.boundaries.length !== last.boundaries.length ? `从 ${first.boundaries.length + 1} 个阶段修正为 ${last.boundaries.length + 1} 个阶段` : "本轮阶段数量保持稳定"}</p></article>
        </section>
        <button className="mod-start mod-review-next" type="button" onClick={continueAfterReview} disabled={busy}>{trialIndex < plan.length - 1 ? "进入下一条曲线" : "完成本次模块"}<span>→</span></button>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <main className="mod-site mod-complete-page">
        <section>
          <span className="mod-eyebrow">SESSION COMPLETE</span>
          <h1>{currentModule.number} 模块已完成。</h1>
          <p>共记录 {answers.length} 次判断，覆盖 {plan.length} 条实验曲线。浏览器中的副本可以下载，服务器端记录已与会话编号关联。</p>
          <div className="mod-session-code"><span>SESSION ID</span><code>{sessionId}</code></div>
          <div className="mod-complete-actions">
            <button type="button" onClick={() => downloadJson(`boundary-lab-${sessionId}.json`, { protocolVersion: bundle.protocolVersion, sessionId, module: currentModule, plan, answers })}>下载本次 JSON</button>
            <button type="button" onClick={() => window.location.reload()}>返回模块首页</button>
          </div>
        </section>
      </main>
    );
  }

  const sameAsPrevious = previousAnswer
    ? sameNumbers(boundaries, previousRatios) &&
      widths.length === previousAnswer.boundaryIntervals.length &&
      widths.every((value, index) => value === previousAnswer.boundaryIntervals[index]?.halfWidthRatio)
    : false;

  return (
    <main className="mod-site mod-runner">
      <header className="mod-topbar">
        <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>06</b></span>
        <div className="mod-run-progress"><span>{currentModule.number} · {currentModule.title}</span><strong>曲线 {trialIndex + 1}/{plan.length}</strong><i><b style={{ width: `${((trialIndex + disclosureIndex / currentTrial.disclosures.length) / plan.length) * 100}%` }} /></i></div>
        <span className="mod-session-mini">ID {sessionId.slice(0, 8)}</span>
      </header>

      {currentTrial.module === "disclosure" ? <DisclosureRail keys={currentTrial.disclosures} activeIndex={disclosureIndex} /> : <DisclosureSnapshot active={currentDisclosure} />}

      <section className="mod-run-layout">
        <div className="mod-run-main">
          <div className="mod-stimulus-heading">
            <div>
              <span className="mod-eyebrow">{currentTrial.variantLabel} · {TASKS[currentTrial.taskType].short}</span>
              <h1>{visibility.asset ? `${displayName}（${displaySymbol}）` : visibility.metric ? currentMetric.name : "一段未命名的走势"}</h1>
              <p>{visibility.intro ? displayIntro : visibility.metric ? currentMetric.definition : "请只根据当前可见的信息判断阶段结构。"}</p>
            </div>
            <div className="mod-condition-chips">
              <span>{visibility.metric ? currentMetric.name : "指标：？"}</span>
              <span>{visibility.axes ? `${RESOLUTION_LABEL[currentTrial.resolution]} · ${currentTrial.scaleMode === "log" ? "对数" : "线性"}` : "坐标：？"}</span>
              <span>{visibility.asset ? displaySymbol : "资产：？"}</span>
            </div>
          </div>

          {currentTrial.taskType === "T3" && <div className="mod-definition"><span>统一阶段定义</span><p>{STAGE_DEFINITION}</p></div>}

          <ModularChart
            points={points}
            metric={currentTrial.metric}
            unit={currentMetric.unit}
            resolution={currentTrial.resolution}
            scaleMode={currentTrial.scaleMode}
            visibility={visibility}
            boundaries={boundaries}
            widths={widths}
            previousBoundaries={currentTrial.module === "disclosure" && disclosureIndex > 0 ? previousRatios : []}
            events={visibleEvents}
            taskType={currentTrial.taskType}
            onBoundariesChange={(values) => {
              setBoundaries(values);
              if (widths.length !== values.length) setWidths(Array(values.length).fill(null));
            }}
            onBoundaryInteraction={markBoundaryInteraction}
          />

          {visibleEvents.length > 0 && (
            <section className="mod-event-panel">
              <div className="mod-event-panel-head"><span className="mod-kicker">本步新增 · 历史事件</span><strong>{visibleEvents.length} 项</strong></div>
              <div className="mod-event-list">
                {visibleEvents.map((event) => (
                  <article key={`${event.date}-${event.title}`}><time>{event.date}</time><span className={event.priority === "high" ? "is-high" : ""}>{event.priority === "high" ? "高优先" : "低优先"}</span><h3>{event.title}</h3><p>{event.description}</p>{event.sourceUrl && <a href={event.sourceUrl} target="_blank" rel="noreferrer">事件来源 ↗</a>}</article>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="mod-response-panel">
          <section className="mod-task-brief">
            <span className="mod-kicker">当前任务 · {currentTrial.taskType}</span>
            <h2>{TASKS[currentTrial.taskType].title}</h2>
            <p>{TASKS[currentTrial.taskType].description}</p>
          </section>

          <BoundaryEditor
            taskType={currentTrial.taskType}
            boundaries={boundaries}
            widths={widths}
            points={points}
            singleStageConfirmed={singleStageConfirmed}
            onSingleStageConfirmed={setSingleStageConfirmed}
            onBoundariesChange={setBoundaries}
            onWidthsChange={setWidths}
            onBoundaryInteraction={markBoundaryInteraction}
            onUncertaintyInteraction={markUncertaintyInteraction}
          />

          <section className="mod-question-block">
            <h3>你对这次划分有多大信心？</h3>
            <Rating value={confidence} onChange={(value) => { setConfidence(value); setConfidenceTouched(true); }} left="很不确定" right="非常确定" label="判断信心" />
          </section>

          {currentTrial.module === "disclosure" && disclosureIndex > 0 && (
            <section className="mod-question-block is-new">
              <span className="mod-new-flag">NEW · 本步新增</span>
              <h3>这一步新增的信息，对你的判断影响有多大？</h3>
              <Rating value={influence} onChange={(value) => { setInfluence(value); setInfluenceTouched(true); }} left="几乎没有" right="影响很大" label="新增信息影响" />
              {sameAsPrevious && (
                <div className="mod-confirm-row compact"><input id="mod-no-change" type="checkbox" checked={noChangeConfirmed} onChange={(event) => setNoChangeConfirmed(event.target.checked)} /><label htmlFor="mod-no-change"><strong>我确认有意保持不变</strong><small>分界点和范围与上一步一致。</small></label></div>
              )}
            </section>
          )}

          <section className="mod-question-block">
            <h3>这次判断主要参考了什么？<small>可多选</small></h3>
            <div className="mod-cue-list">{CUES.map((cue) => <button type="button" key={cue} className={cueTags.includes(cue) ? "is-selected" : ""} onClick={() => setCueTags((value) => value.includes(cue) ? value.filter((item) => item !== cue) : [...value, cue])}>{cue}</button>)}</div>
            <label className="mod-rationale"><span>还想补充什么？<small>可不填</small></span><textarea value={rationale} maxLength={1000} onChange={(event) => setRationale(event.target.value)} placeholder="例如：这里开始由持续上涨转为高位震荡……" /><i>{rationale.length}/1000</i></label>
          </section>

          {error && <p className="mod-error" role="alert">{error}</p>}
          <button className="mod-submit" type="button" onClick={(event) => submitResponse(event.timeStamp)} disabled={busy}>{busy ? "正在安全记录…" : disclosureIndex < currentTrial.disclosures.length - 1 ? "提交本步，揭示下一项信息" : "提交本轮，查看反馈"}<span>→</span></button>
          <p className="mod-lock-note">提交后不能返回修改本步答案。</p>
        </aside>
      </section>
    </main>
  );
}
