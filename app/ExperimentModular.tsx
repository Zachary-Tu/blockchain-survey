"use client";

import Link from "next/link";
import { buildCsv } from "@/lib/csv";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

export type ModuleKey = "disclosure" | "framing" | "cross-series" | "robustness";
export type TaskType = "T1" | "T2" | "T3";
export type MetricKey = "price" | "activeAddresses" | "googleTrends";
export type Resolution = "daily" | "weekly" | "monthly" | "yearly";
export type ScaleMode = "linear" | "log";
export type WindowMode = "whole" | "truncated";
export type DisclosurePath = "general" | "domain" | "combined";
export type DisclosureKey = "G0" | "GI1" | "GI2" | "DI1" | "DI2" | "DI3" | "DI4" | "FULL";
export type RobustnessFactor = "resolution" | "scale" | "window" | "controls";
type Phase = "setup" | "briefing" | "transition" | "experiment" | "review" | "complete";
type EntryMode = "console" | "pilot" | "m1";

export type Point = { date: string; value: number };
export type ResolutionData = {
  points: Point[];
  referenceBoundaries: number[];
  referenceBoundariesByCount: Record<string, number[]>;
};
export type MetricData = {
  name: string;
  shortName?: string;
  unit: string;
  definition: string;
  available: boolean;
  unavailableReason?: string;
  source: Record<string, unknown>;
  resolutions: Partial<Record<Resolution, ResolutionData>>;
};
export type EventAnnotation = {
  sourceId?: string;
  date: string;
  title: string;
  description: string;
  category: string;
  sourceUrl: string;
  priority: "high" | "low";
  sourcePriority?: number;
  priorityBand?: "core" | "supplementary";
  priorityProtocol?: string;
};
export type Asset = {
  id: string;
  name: string;
  nameZh: string;
  symbol: string;
  intro: string;
  events: EventAnnotation[];
  metrics: Record<MetricKey, MetricData>;
};
export type ControlSeries = {
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
export type Bundle = {
  protocolVersion: string;
  datasetVersion?: string;
  dataset?: Record<string, unknown>;
  requestedWindow: { start: string; end: string };
  curatedWindow?: { start: string; end: string; rule: string; rationale?: string };
  sourceWindows?: Record<string, { start: string; end: string }>;
  assets: Asset[];
  controls: ControlSeries[];
};
export type TrialPlan = {
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
export type BoundaryRecord = { index: number; ratio: number; date: string };
export type IntervalRecord = {
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
  responseVersion: string;
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
  confidence?: number;
  influenceRating: number | null;
  influenceTouched: boolean;
  noChangeConfirmed: boolean;
  cueTags: string[];
  rationale: string;
  stimulusType: string;
  resolution: Resolution;
  scaleMode: ScaleMode;
  windowMode: WindowMode;
  disclosureState: Record<string, unknown>;
  stimulusWindow: Record<string, unknown>;
  elapsedMs: number;
  revealReadMs: number;
  firstMoveMs: number | null;
  firstUncertaintyMs: number | null;
  adjustmentCount: number;
  uncertaintyAdjustmentCount: number;
  clientStartedAt?: string;
  clientSubmittedAt?: string;
  responseViewportWidth?: number;
  responseViewportHeight?: number;
  responseOrientation?: string;
  pageHiddenMs?: number;
  activeElapsedMs?: number;
};

type ResumeSessionPayload = {
  session?: {
    id: string;
    participantCode: string;
    expertise: string;
    status: string;
    protocolVersion: string;
    studyConfig: Record<string, unknown>;
  };
  answers?: ModularAnswer[];
  error?: string;
};

type LayerAssetDraft = {
  boundaries: number[];
  widths: Array<number | null>;
  singleStageConfirmed: boolean;
  influence: number;
  influenceTouched: boolean;
  noChangeConfirmed: boolean;
  cueTags: string[];
  rationale: string;
  firstMoveAt: number | null;
  firstUncertaintyAt: number | null;
  lastInteractionAt: number | null;
  adjustmentCount: number;
  uncertaintyAdjustmentCount: number;
  clientStartedAt?: string;
  clientSubmittedAt?: string;
  responseViewportWidth?: number;
  responseViewportHeight?: number;
  responseOrientation?: string;
  pageHiddenMs?: number;
  activeElapsedMs?: number;
};

type DeviceInfo = {
  deviceType: "mobile" | "tablet" | "desktop" | "unknown";
  userAgent: string;
  platform: string;
  browserLanguage: string;
  timezone: string;
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  devicePixelRatio: number | null;
  touchPoints: number;
  pointerType: "coarse" | "fine" | "none" | "unknown";
  orientation: string;
};

function currentOrientation() {
  if (typeof window === "undefined") return "unknown";
  return window.screen.orientation?.type ||
    (window.innerWidth >= window.innerHeight ? "landscape" : "portrait");
}

function collectDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      deviceType: "unknown",
      userAgent: "",
      platform: "",
      browserLanguage: "",
      timezone: "",
      screenWidth: null,
      screenHeight: null,
      viewportWidth: null,
      viewportHeight: null,
      devicePixelRatio: null,
      touchPoints: 0,
      pointerType: "unknown",
      orientation: "unknown",
    };
  }
  const clientNavigator = navigator as Navigator & {
    userAgentData?: { mobile?: boolean; platform?: string };
  };
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const fine = window.matchMedia?.("(pointer: fine)").matches ?? false;
  const touchPoints = Math.max(0, navigator.maxTouchPoints || 0);
  const minimumScreenDimension = Math.min(window.screen.width, window.screen.height);
  const mobileSignal = clientNavigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPod|IEMobile|Mobile/i.test(navigator.userAgent);
  const tabletSignal = /iPad|Tablet/i.test(navigator.userAgent) ||
    (coarse && touchPoints > 0 && minimumScreenDimension >= 600 && minimumScreenDimension <= 1366);
  const deviceType: DeviceInfo["deviceType"] = tabletSignal
    ? "tablet"
    : mobileSignal
      ? "mobile"
      : "desktop";
  const pointerType: DeviceInfo["pointerType"] = coarse
    ? "coarse"
    : fine
      ? "fine"
      : "none";
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    timezone = "";
  }
  return {
    deviceType,
    userAgent: navigator.userAgent,
    platform: clientNavigator.userAgentData?.platform || navigator.platform || "",
    browserLanguage: navigator.language || "",
    timezone,
    screenWidth: window.screen.width || null,
    screenHeight: window.screen.height || null,
    viewportWidth: window.innerWidth || null,
    viewportHeight: window.innerHeight || null,
    devicePixelRatio: Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : null,
    touchPoints,
    pointerType,
    orientation: currentOrientation(),
  };
}

type ProtocolVariant = "v4" | "pre-v4";
export type CueOption = { code: string; label: string; exclusive?: boolean };
export type CueSet = {
  eyebrow: string;
  question: string;
  note: string;
  options: CueOption[];
};

export const MODULES: Array<{
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

export const TASKS: Record<TaskType, { title: string; short: string; description: string }> = {
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

export const STAGE_DEFINITION =
  "阶段是曲线在趋势方向、平均水平或波动结构上持续存在的相对稳定状态；短暂尖峰或单个异常点本身不足以构成独立阶段。";

export const DISCLOSURE_COPY: Record<DisclosureKey, { title: string; short: string; description: string }> = {
  G0: { title: "匿名曲线", short: "基线", description: "只显示曲线形状与完成任务所需的控件。" },
  GI1: { title: "序列类型", short: "GI1", description: "披露这是价格、活跃地址或搜索热度序列。" },
  GI2: { title: "时间与单位", short: "GI2", description: "在序列类型基础上披露真实时间轴与数值单位。" },
  DI1: { title: "资产名称", short: "DI1", description: "只披露该加密资产的名称。" },
  DI2: { title: "资产基础介绍", short: "DI2", description: "在资产名称基础上增加一段中性背景。" },
  DI3: { title: "事件信息（一）", short: "DI3", description: "增加预先选定的第一组历史事件。" },
  DI4: { title: "事件信息（二）", short: "DI4", description: "在第一组基础上增加预先选定的第二组历史事件。" },
  FULL: { title: "完整信息包", short: "FULL", description: "同时显示序列类型、坐标、资产背景与全部事件。" },
};

export const DISCLOSURE_PATHS: Record<DisclosurePath, DisclosureKey[]> = {
  general: ["G0", "GI1", "GI2"],
  domain: ["G0", "DI1", "DI2", "DI3", "DI4"],
  combined: ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4"],
};

export const SNAPSHOT_OPTIONS: DisclosureKey[] = ["G0", "GI1", "GI2", "DI1", "DI2", "DI3", "DI4", "FULL"];
export const METRIC_LABEL: Record<MetricKey, string> = {
  price: "价格数据",
  activeAddresses: "活跃地址",
  googleTrends: "Google Trends Index",
};
export const RESOLUTION_LABEL: Record<Resolution, string> = {
  daily: "日频",
  weekly: "周频",
  monthly: "月频",
  yearly: "年频",
};
const M1_CHART_FRAME = Object.freeze({
  width: 1120,
  height: 600,
  margin: Object.freeze({ top: 72, right: 28, bottom: 72, left: 88 }),
});
const M1_DISCLOSURE_SAFE_METRIC_COPY: Record<MetricKey, string> = Object.freeze({
  price: "该曲线表示价格数据。",
  activeAddresses: "该曲线表示活跃地址数量数据。",
  googleTrends: "该曲线表示 Google 搜索热度指数。",
});
const M1_AXIS_DISCLOSURE_COPY: Record<MetricKey, string> = Object.freeze({
  price: "该曲线表示价格数据；纵轴单位为美元（USD）。",
  activeAddresses: "该曲线表示活跃地址数量；纵轴单位为地址数。",
  googleTrends: "该曲线表示 Google 搜索热度指数；纵轴为相对热度指数。",
});

function metricDescriptionForDisclosure(
  metric: MetricKey,
  axesRevealed: boolean,
  fullDefinition: string,
  disclosureSafe = false,
) {
  if (!axesRevealed) return M1_DISCLOSURE_SAFE_METRIC_COPY[metric];
  return disclosureSafe ? M1_AXIS_DISCLOSURE_COPY[metric] : fullDefinition;
}
const LEGACY_CUES = ["趋势方向", "均值变化", "波动结构", "持续时间", "序列类型", "资产知识", "历史事件", "其他"];
export const CUE_SCHEMA_VERSION = "disclosure-specific-cues-v2";
export const CUE_SETS: Record<DisclosureKey, CueSet> = {
  G0: {
    eyebrow: "仅依据曲线形状",
    question: "这次划分主要依据了哪些曲线线索？",
    note: "此时没有语义信息，请只报告你实际使用的视觉线索。",
    options: [
      { code: "g0_trend_slope", label: "趋势方向或斜率持续改变" },
      { code: "g0_level_shift", label: "整体水平或基线发生变化" },
      { code: "g0_variance_noise", label: "波动幅度或噪声结构改变" },
      { code: "g0_abrupt_reversal", label: "出现突发跳跃或方向反转" },
      { code: "g0_persistence", label: "变化后形成持续稳定的新状态" },
    ],
  },
  GI1: {
    eyebrow: "本步新增 · 序列类型",
    question: "新增的序列类型信息主要怎样影响了判断？",
    note: "请选择你如何使用“价格、活跃地址或搜索热度”这一类别信息。",
    options: [
      { code: "gi1_metric_meaning", label: "改变了我对曲线含义的理解" },
      { code: "gi1_expected_dynamics", label: "参考了这类指标通常的变化模式" },
      { code: "gi1_spike_interpretation", label: "重新判断尖峰是信号还是扰动" },
      { code: "gi1_domain_prior", label: "调用了对同类指标的既有经验" },
      { code: "gi1_no_effect", label: "序列类型没有改变我的判断", exclusive: true },
    ],
  },
  GI2: {
    eyebrow: "本步新增 · 时间与单位",
    question: "新增的坐标信息主要怎样影响了判断？",
    note: "本步只询问日期、持续时长、频率、单位和刻度带来的作用。",
    options: [
      { code: "gi2_calendar_location", label: "具体日期或所处历史时点" },
      { code: "gi2_duration", label: "候选阶段各自持续的时长" },
      { code: "gi2_resolution_density", label: "数据频率与可见观测密度" },
      { code: "gi2_unit_scale", label: "数值单位、量级与坐标刻度" },
      { code: "gi2_no_effect", label: "坐标信息没有改变我的判断", exclusive: true },
    ],
  },
  DI1: {
    eyebrow: "本步新增 · 资产名称",
    question: "新增的资产身份主要怎样影响了判断？",
    note: "请区分币名带来的既有知识，与曲线本身的形状判断。",
    options: [
      { code: "di1_asset_category", label: "资产身份或所属类别" },
      { code: "di1_cycle_memory", label: "对该资产历史周期的记忆" },
      { code: "di1_personal_familiarity", label: "个人关注、研究或交易经验" },
      { code: "di1_expected_behavior", label: "对该资产典型走势的预期" },
      { code: "di1_no_effect", label: "资产名称没有改变我的判断", exclusive: true },
    ],
  },
  DI2: {
    eyebrow: "本步新增 · 资产背景",
    question: "新增的背景介绍主要怎样影响了判断？",
    note: "请选择背景事实中真正参与本轮推断的部分。",
    options: [
      { code: "di2_launch_maturity", label: "上线时间与所处发展阶段" },
      { code: "di2_function_positioning", label: "技术用途或网络定位" },
      { code: "di2_mechanism", label: "发行、共识或运行机制" },
      { code: "di2_background_fit", label: "背景事实与曲线形态是否一致" },
      { code: "di2_no_effect", label: "背景介绍没有改变我的判断", exclusive: true },
    ],
  },
  DI3: {
    eyebrow: "本步新增 · 核心事件",
    question: "新增的重要事件主要怎样影响了判断？",
    note: "请报告事件日期与曲线变化之间实际使用的对应关系。",
    options: [
      { code: "di3_event_proximity", label: "事件日期与候选分界点接近" },
      { code: "di3_post_event_level", label: "事件后方向或水平发生改变" },
      { code: "di3_post_event_variance", label: "事件后波动状态发生改变" },
      { code: "di3_event_cluster", label: "多个重要事件共同界定阶段" },
      { code: "di3_no_effect", label: "重要事件没有改变我的判断", exclusive: true },
    ],
  },
  DI4: {
    eyebrow: "本步新增 · 补充事件",
    question: "新增的补充事件主要怎样影响了判断？",
    note: "请只报告本步新增事件带来的细化、扰动或相互印证。",
    options: [
      { code: "di4_boundary_refinement", label: "进一步细化了已有分界位置" },
      { code: "di4_short_disturbance", label: "提示某段变化只是短期扰动" },
      { code: "di4_event_density", label: "事件密度或聚集形成阶段线索" },
      { code: "di4_cross_event_consistency", label: "与重要事件相互印证或冲突" },
      { code: "di4_no_effect", label: "补充事件没有改变我的判断", exclusive: true },
    ],
  },
  FULL: {
    eyebrow: "当前可见 · 完整信息包",
    question: "在完整信息中，哪些类别实际主导了判断？",
    note: "完整快照只保留五个高层类别，便于与分层披露条件比较。",
    options: [
      { code: "full_curve_structure", label: "曲线结构与持续状态变化" },
      { code: "full_axes_time", label: "时间、单位、频率与坐标刻度" },
      { code: "full_metric_type", label: "序列类型及其通常变化模式" },
      { code: "full_asset_context", label: "资产身份、背景与既有知识" },
      { code: "full_events", label: "历史事件及其与曲线的对应" },
    ],
  },
};
export const UNCERTAINTY_MIN = 0;
export const UNCERTAINTY_MAX = 0.2;
export const UNCERTAINTY_STEP = 0.005;
export const UNCERTAINTY_DEFAULT = 0.05;
export const MAX_EVENTS_PER_DISCLOSURE = 10;
export const EVENT_SELECTION_PROTOCOL = "events-20260527-priority-bands-even-spacing-v1";

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

function eventSourcePriority(event: EventAnnotation) {
  if (typeof event.sourcePriority === "number") return event.sourcePriority;
  return event.priority === "high" ? 1 : 3;
}

export function selectDisclosureEvents(
  events: EventAnnotation[],
  band: "core" | "supplementary",
  startDate: string,
  endDate: string,
  limit = MAX_EVENTS_PER_DISCLOSURE,
) {
  const candidates = events
    .filter((event) => {
      const priority = eventSourcePriority(event);
      const inBand = band === "core" ? priority <= 2 : priority >= 3;
      return inBand && event.date >= startDate && event.date <= endDate;
    })
    .sort((first, second) =>
      first.date.localeCompare(second.date) ||
      (first.sourceId ?? first.title).localeCompare(second.sourceId ?? second.title),
    );
  if (candidates.length <= limit) return candidates;
  if (limit <= 1) return candidates.slice(0, Math.max(0, limit));
  return Array.from({ length: limit }, (_, index) =>
    candidates[Math.round(index * (candidates.length - 1) / (limit - 1))],
  );
}

export function initialBoundaries(task: TaskType, startBlank = false) {
  return task === "T1" || startBlank ? [] : [1 / 3, 2 / 3];
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

export function boundaryRecords(values: number[], points: Point[]): BoundaryRecord[] {
  return [...values].sort((a, b) => a - b).map((ratio) => {
    const index = clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1);
    return { index, ratio: Number(ratio.toFixed(6)), date: points[index].date };
  });
}

export function intervalRecords(values: number[], widths: Array<number | null>, points: Point[]): IntervalRecord[] {
  return values.flatMap((centerRatio, boundaryIndex) => {
    const halfWidthRatio = widths[boundaryIndex];
    if (halfWidthRatio === null || halfWidthRatio === undefined) return [];
    if (halfWidthRatio > centerRatio || halfWidthRatio > 1 - centerRatio) return [];
    const lowerRatio = centerRatio - halfWidthRatio;
    const upperRatio = centerRatio + halfWidthRatio;
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

export function disclosureVisibility(key: DisclosureKey, path: DisclosurePath) {
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

export function makeTrialPlan(
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
    windowMode: WindowMode;
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
        windowMode: config.windowMode,
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
        windowMode: config.windowMode,
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
        windowMode: config.windowMode,
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
          windowMode: config.windowMode,
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
          windowMode: config.windowMode,
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
          windowMode: config.windowMode,
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

export function ModularChart({
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
  interactive = true,
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
  interactive?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragIndex = useRef<number | null>(null);
  const [placementWarning, setPlacementWarning] = useState("");
  const width = M1_CHART_FRAME.width;
  const height = M1_CHART_FRAME.height;
  // Keep the plotting frame identical across disclosures. GI2 reveals labels,
  // but must not geometrically rescale the curve that the participant judges.
  const margin = M1_CHART_FRAME.margin;
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
  const paddedMinimum = scaleMode === "linear" && minimum >= 0
    ? Math.max(0, minimum - range * 0.05)
    : minimum - range * 0.05;
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
  const minimumBoundaryGap = 1 / Math.max(points.length - 1, 1);
  const stageEdges = taskType !== "T1" && boundaries.length < 2
    ? [0, 1]
    : [0, ...boundaries, 1];
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
      const rawRatio = clamp((svgX - margin.left) / plotWidth, minimumBoundaryGap, 1 - minimumBoundaryGap);
      const observationIndex = Math.round(rawRatio * Math.max(points.length - 1, 1));
      return observationIndex / Math.max(points.length - 1, 1);
    },
    [margin.left, minimumBoundaryGap, plotWidth, points.length, width],
  );

  const isWithinPlot = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const svgY = ((clientY - rect.top) / rect.height) * height;
    return svgX >= margin.left && svgX <= width - margin.right &&
      svgY >= margin.top && svgY <= margin.top + plotHeight;
  }, [height, margin.left, margin.right, margin.top, plotHeight, width]);

  const updateBoundary = useCallback(
    (index: number, nextRatio: number) => {
      const lower = index === 0 ? minimumBoundaryGap : boundaries[index - 1] + minimumBoundaryGap;
      const upper = index === boundaries.length - 1 ? 1 - minimumBoundaryGap : boundaries[index + 1] - minimumBoundaryGap;
      const next = [...boundaries];
      next[index] = clamp(nextRatio, lower, upper);
      onBoundariesChange(next);
    },
    [boundaries, minimumBoundaryGap, onBoundariesChange],
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
    if (!isWithinPlot(event.clientX, event.clientY)) return;
    const nextRatio = ratioFromEvent(event.clientX);
    if (taskType !== "T1" && boundaries.length < 2) {
      if (boundaries.length === 1 &&
        Math.round(boundaries[0] * Math.max(points.length - 1, 1)) === Math.round(nextRatio * Math.max(points.length - 1, 1))) {
        setPlacementWarning("两个分界点不能落在同一个观测位置，请在曲线上另选一个位置。");
        return;
      }
      setPlacementWarning("");
      onBoundaryInteraction();
      onBoundariesChange([...boundaries, nextRatio].sort((first, second) => first - second));
      return;
    }
    setPlacementWarning("");
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
        aria-label={interactive ? "用于阶段划分的交互式时间序列曲线" : "用于 Agent 阶段划分的时间序列曲线"}
        onPointerDown={interactive ? onCanvasPointerDown : undefined}
        onPointerMove={interactive ? onPointerMove : undefined}
        onPointerUp={interactive ? finishDrag : undefined}
        onPointerCancel={interactive ? finishDrag : undefined}
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
              <line x1={xAt(event.ratio)} x2={xAt(event.ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke="#738b86" strokeWidth="1.75" strokeDasharray="4 6" opacity="0.75" />
              <circle cx={xAt(event.ratio)} cy={event.labelY} r="4.5" fill="#738b86" />
              <text x={xAt(event.ratio) + 8} y={event.labelY + 4} className="mod-event-label">{event.title.length > 13 ? `${event.title.slice(0, 13)}…` : event.title}</text>
            </g>
          ))}

          {previousBoundaries.map((ratio, index) => (
            <g key={`previous-${index}`}>
              <line x1={xAt(ratio)} x2={xAt(ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke="#c96d45" strokeWidth="7" strokeDasharray="8 8" opacity="0.56" />
              <rect x={xAt(ratio) - 40} y={margin.top + 9} width="80" height="25" rx="12.5" fill="#fff4ed" stroke="#c96d45" />
              <text x={xAt(ratio)} y={margin.top + 26} textAnchor="middle" className="mod-prior-label">上一步 {index + 1}</text>
            </g>
          ))}

          {boundaries.map((ratio, index) => (
            <g
              key={`boundary-${index}`}
              data-boundary-handle
              className="mod-boundary-handle"
              onPointerDown={interactive ? (event) => {
                event.stopPropagation();
                dragIndex.current = index;
                event.currentTarget.ownerSVGElement?.setPointerCapture?.(event.pointerId);
                onBoundaryInteraction();
              } : undefined}
            >
              <line x1={xAt(ratio)} x2={xAt(ratio)} y1={margin.top} y2={margin.top + plotHeight} stroke="#153832" strokeWidth="3" strokeDasharray="7 6" />
              <circle cx={xAt(ratio)} cy={margin.top + plotHeight * 0.54} r="18" fill="#fffdf8" stroke="#153832" strokeWidth="4" />
              <circle cx={xAt(ratio)} cy={margin.top + plotHeight * 0.54} r="4" fill="#153832" />
            </g>
          ))}
        </g>

        {boundaries.map((ratio, index) => (
          <g key={`boundary-label-${index}`} pointerEvents="none">
            <rect x={xAt(ratio) - 43} y={margin.top - 45} width="86" height="34" rx="17" fill="#153832" />
            <text x={xAt(ratio)} y={margin.top - 23} textAnchor="middle" className="mod-boundary-label">分界点 {index + 1}</text>
          </g>
        ))}

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
      {placementWarning && <p className="mod-chart-placement-warning" role="alert">{placementWarning}</p>}
      <div className="mod-chart-footnote">
        <span>{interactive
          ? taskType !== "T1" && boundaries.length < 2
            ? boundaries.length === 0
              ? "请在绘图区内点击，放置第一个分界点"
              : "请在绘图区内点击另一个位置，完成两个分界点"
            : "拖动分界线；点击绘图区可快速移动最近的分界点"
          : "Agent 通过右侧 JSON 精确提交分界位置"}</span>
        <span>{visibility.axes ? `${points.length.toLocaleString("zh-CN")} 个${RESOLUTION_LABEL[resolution]}观测值` : "当前仅显示曲线形状"}</span>
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
  showDates,
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
  showDates: boolean;
}) {
  const minimumBoundaryGap = 1 / Math.max(points.length - 1, 1);
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
    const lower = index === 0 ? minimumBoundaryGap : boundaries[index - 1] + minimumBoundaryGap;
    const upper = index === boundaries.length - 1 ? 1 - minimumBoundaryGap : boundaries[index + 1] - minimumBoundaryGap;
    const next = [...boundaries];
    next[index] = clamp(value, lower, upper);
    const maximumSymmetricWidth = Math.max(
      UNCERTAINTY_MIN,
      Math.min(UNCERTAINTY_MAX, next[index], 1 - next[index]),
    );
    const nextWidths = [...widths];
    if (nextWidths[index] !== null && (nextWidths[index] ?? 0) > maximumSymmetricWidth) {
      nextWidths[index] = maximumSymmetricWidth;
      onWidthsChange(nextWidths);
    }
    onBoundaryInteraction();
    onBoundariesChange(next);
  };

  return (
    <div className="mod-boundary-editor">
      <div className="mod-editor-heading">
        <div>
          <span className="mod-kicker">阶段结构</span>
          <h3>{taskType === "T1"
            ? `当前划分：${boundaries.length + 1} 个阶段`
            : boundaries.length < 2
              ? `请在主图上点击两个分界位置（${boundaries.length}/2）`
              : "调整两个分界点"}</h3>
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

      {taskType !== "T1" && boundaries.length < 2 && (
        <div className="mod-placement-guide" role="status" aria-live="polite">
          <strong>当前没有预设位置</strong>
          <span>请直接点击左侧主图的两个位置；完成后系统会按从左到右编号。</span>
        </div>
      )}

      {boundaries.map((ratio, index) => {
        const point = points[clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1)];
        const maximumSymmetricWidth = Math.max(
          UNCERTAINTY_MIN,
          Math.min(UNCERTAINTY_MAX, ratio, 1 - ratio),
        );
        return (
          <article className="mod-boundary-row" key={`editor-${index}`}>
            <div className="mod-boundary-row-head">
              <div><strong>分界点 {index + 1}</strong><span>{showDates ? point?.date ?? "—" : "当前仅记录相对位置"}</span></div>
              {taskType === "T1" && <button type="button" onClick={() => removeBoundary(index)} aria-label={`删除分界点 ${index + 1}`}>删除</button>}
            </div>
            <input
              aria-label={`调整分界点 ${index + 1}`}
              type="range"
              min={minimumBoundaryGap}
              max={1 - minimumBoundaryGap}
              step={minimumBoundaryGap}
              value={ratio}
              onChange={(event) => updateSlider(index, Number(event.target.value))}
            />
            {taskType === "T1" || boundaries.length === 2 ? (
              <>
                <div className="mod-uncertainty-question">
                  <span>你认为最佳分界线大致落在哪个范围？</span>
                  <small>拖动旋钮连续调整；0% 只表示提交当前点，不等同于绝对确定；范围越宽，表示位置越不确定</small>
                </div>
                <div className={`mod-uncertainty-slider ${widths[index] === null ? "is-unset" : ""}`}>
                  <div className="mod-uncertainty-readout">
                    <span>更精确</span>
                    <output htmlFor={`mod-uncertainty-${index}`}>
                      {widths[index] === null
                        ? "请拖动确认"
                        : widths[index] === 0
                          ? "0% · 仅点估计"
                          : `±${((widths[index] ?? 0) * 100).toFixed(1)}% 时间窗`}
                    </output>
                    <span>更宽泛</span>
                  </div>
                  <input
                    id={`mod-uncertainty-${index}`}
                    aria-label={`调整分界点 ${index + 1} 的不确定范围`}
                    type="range"
                    min={UNCERTAINTY_MIN}
                    max={maximumSymmetricWidth}
                    step={UNCERTAINTY_STEP}
                    value={Math.min(widths[index] ?? UNCERTAINTY_DEFAULT, maximumSymmetricWidth)}
                    onChange={(event) => {
                      const next = [...widths];
                      next[index] = Number(event.target.value);
                      onUncertaintyInteraction();
                      onWidthsChange(next);
                    }}
                  />
                  <div className="mod-uncertainty-scale" aria-hidden="true">
                    <span>总宽度 0%</span><i /><span>总宽度 {(maximumSymmetricWidth * 200).toFixed(1)}%</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="mod-boundary-pending">先放置第二个分界点，再分别设置两个不确定范围。</p>
            )}
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

function downloadText(filename: string, value: string, type: string) {
  const blob = new Blob([value], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadSessionCsv(
  sessionId: string,
  answers: ModularAnswer[],
  deviceInfo: DeviceInfo | null,
  sessionProtocolVersion: string,
  stimulusProtocolVersion: string,
  baselinePlacementProtocol: string,
) {
  const csv = buildCsv(answers, [
    { key: "session_id", value: () => sessionId },
    { key: "session_protocol_version", value: () => sessionProtocolVersion },
    { key: "response_version", value: (row) => row.responseVersion },
    { key: "stimulus_protocol_version", value: () => stimulusProtocolVersion },
    { key: "baseline_placement_protocol", value: () => baselinePlacementProtocol },
    { key: "device_type", value: () => deviceInfo?.deviceType ?? "unknown" },
    { key: "screen_width", value: () => deviceInfo?.screenWidth ?? "" },
    { key: "screen_height", value: () => deviceInfo?.screenHeight ?? "" },
    { key: "initial_viewport_width", value: () => deviceInfo?.viewportWidth ?? "" },
    { key: "initial_viewport_height", value: () => deviceInfo?.viewportHeight ?? "" },
    { key: "device_pixel_ratio", value: () => deviceInfo?.devicePixelRatio ?? "" },
    { key: "client_platform", value: () => deviceInfo?.platform ?? "" },
    { key: "browser_language", value: () => deviceInfo?.browserLanguage ?? "" },
    { key: "client_timezone", value: () => deviceInfo?.timezone ?? "" },
    { key: "pointer_type", value: () => deviceInfo?.pointerType ?? "unknown" },
    { key: "touch_points", value: () => deviceInfo?.touchPoints ?? 0 },
    { key: "screen_orientation", value: () => deviceInfo?.orientation ?? "unknown" },
    { key: "user_agent", value: () => deviceInfo?.userAgent ?? "" },
    { key: "trial_id", value: (row) => row.trialId },
    { key: "trial_order", value: (row) => row.trialOrder },
    { key: "disclosure_index", value: (row) => row.disclosureIndex },
    { key: "disclosure_key", value: (row) => row.disclosureKey },
    { key: "task_type", value: (row) => row.taskType },
    { key: "stimulus_type", value: (row) => row.stimulusType },
    { key: "asset_id", value: (row) => row.assetId },
    { key: "metric_type", value: (row) => row.metric },
    { key: "resolution", value: (row) => row.resolution },
    { key: "scale_mode", value: (row) => row.scaleMode },
    { key: "window_mode", value: (row) => row.windowMode },
    { key: "boundaries_json", value: (row) => JSON.stringify(row.boundaries) },
    { key: "previous_boundaries_json", value: (row) => JSON.stringify(row.previousBoundaries) },
    { key: "boundary_intervals_json", value: (row) => JSON.stringify(row.boundaryIntervals) },
    { key: "single_stage_confirmed", value: (row) => row.singleStageConfirmed },
    { key: "influence_rating", value: (row) => row.influenceRating },
    { key: "influence_touched", value: (row) => row.influenceTouched },
    { key: "no_change_confirmed", value: (row) => row.noChangeConfirmed },
    { key: "cue_tags_json", value: (row) => JSON.stringify(row.cueTags) },
    { key: "rationale", value: (row) => row.rationale },
    { key: "elapsed_ms", value: (row) => row.elapsedMs },
    { key: "reveal_read_ms", value: (row) => row.revealReadMs },
    { key: "first_move_ms", value: (row) => row.firstMoveMs },
    { key: "first_uncertainty_ms", value: (row) => row.firstUncertaintyMs },
    { key: "adjustment_count", value: (row) => row.adjustmentCount },
    { key: "uncertainty_adjustment_count", value: (row) => row.uncertaintyAdjustmentCount },
    { key: "client_started_at", value: (row) => row.clientStartedAt },
    { key: "client_submitted_at", value: (row) => row.clientSubmittedAt },
    { key: "response_viewport_width", value: (row) => row.responseViewportWidth },
    { key: "response_viewport_height", value: (row) => row.responseViewportHeight },
    { key: "response_orientation", value: (row) => row.responseOrientation },
    { key: "page_hidden_ms", value: (row) => row.pageHiddenMs },
    { key: "active_elapsed_ms", value: (row) => row.activeElapsedMs },
    { key: "disclosure_state_json", value: (row) => JSON.stringify(row.disclosureState) },
    { key: "stimulus_window_json", value: (row) => JSON.stringify(row.stimulusWindow) },
  ]);
  downloadText(`boundary-lab-${sessionId}.csv`, csv, "text/csv;charset=utf-8");
}

function sameNumbers(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) < 0.00001);
}

function participantVariantLabel(
  trial: TrialPlan,
  visibility: ReturnType<typeof disclosureVisibility>,
) {
  if (trial.module === "framing") return `${trial.taskType} · ${TASKS[trial.taskType].short}`;
  if (trial.module === "cross-series") {
    return visibility.metric ? METRIC_LABEL[trial.metric] : `序列 ${trial.order + 1}`;
  }
  if (trial.module === "robustness") {
    if (trial.controlId) return visibility.asset ? "对照序列" : `实验条件 ${trial.order + 1}`;
    return visibility.axes ? trial.variantLabel : `实验条件 ${trial.order + 1}`;
  }
  return `曲线 ${trial.order + 1}`;
}

function resolveLayerTrialContext(
  bundle: Bundle,
  trial: TrialPlan,
  disclosureKey: DisclosureKey,
  disclosurePath: DisclosurePath,
) {
  const asset = bundle.assets.find((candidate) => candidate.id === trial.assetId);
  const control = bundle.controls.find((candidate) => candidate.id === trial.controlId);
  const metricData = control
    ? {
        name: control.metric.name,
        unit: control.metric.unit,
        definition: control.metric.definition,
        resolutions: control.metric.resolutions,
      }
    : asset?.metrics[trial.metric];
  const sourcePoints = metricData?.resolutions[trial.resolution]?.points ?? [];
  const curatedStart = bundle.curatedWindow?.start ?? "2020-01-01";
  const curatedEnd = bundle.curatedWindow?.end ?? "2024-12-31";
  const points = trial.windowMode === "truncated"
    ? sourcePoints.filter((point) => point.date >= curatedStart && point.date <= curatedEnd)
    : sourcePoints;
  const sourceWindow = sourcePoints.length
    ? { start: sourcePoints[0].date, end: sourcePoints[sourcePoints.length - 1].date, observationCount: sourcePoints.length }
    : null;
  const displayedWindow = points.length
    ? { start: points[0].date, end: points[points.length - 1].date, observationCount: points.length }
    : null;
  const visibility = disclosureVisibility(disclosureKey, disclosurePath);
  const allEvents = control?.events ?? asset?.events ?? [];
  const eventWindowStart = points[0]?.date ?? "0000-01-01";
  const eventWindowEnd = points[points.length - 1]?.date ?? "9999-12-31";
  const coreEvents = selectDisclosureEvents(allEvents, "core", eventWindowStart, eventWindowEnd);
  const supplementaryEvents = selectDisclosureEvents(allEvents, "supplementary", eventWindowStart, eventWindowEnd);
  const visibleEvents = [
    ...(visibility.highEvents ? coreEvents : []),
    ...(visibility.lowEvents ? supplementaryEvents : []),
  ].sort((first, second) => first.date.localeCompare(second.date));
  const newlyDisclosedEvents = disclosureKey === "DI3"
    ? coreEvents
    : disclosureKey === "DI4"
      ? supplementaryEvents
      : disclosureKey === "FULL"
        ? visibleEvents
        : [];

  return {
    asset,
    control,
    metricData,
    sourcePoints,
    points,
    sourceWindow,
    displayedWindow,
    visibility,
    visibleEvents,
    newlyDisclosedEvents,
    retainedEventCount: Math.max(0, visibleEvents.length - newlyDisclosedEvents.length),
    displayName: control?.nameZh ?? asset?.nameZh ?? "匿名序列",
    displaySymbol: control?.symbol ?? asset?.symbol ?? "",
    displayIntro: control?.intro ?? asset?.intro ?? "",
  };
}

function makeLayerAssetDraft(trial: TrialPlan, previousAnswer?: ModularAnswer): LayerAssetDraft {
  const boundaries = previousAnswer
    ? previousAnswer.boundaries.map((boundary) => boundary.ratio)
    : initialBoundaries(trial.taskType);
  const widths = previousAnswer
    ? boundaries.map((_, index) =>
        previousAnswer.boundaryIntervals.find((interval) => interval.boundaryIndex === index)?.halfWidthRatio ?? null,
      )
    : Array(boundaries.length).fill(null);
  return {
    boundaries,
    widths,
    singleStageConfirmed: previousAnswer?.singleStageConfirmed ?? false,
    influence: 3,
    influenceTouched: false,
    noChangeConfirmed: false,
    cueTags: [],
    rationale: "",
    firstMoveAt: null,
    firstUncertaintyAt: null,
    lastInteractionAt: null,
    adjustmentCount: 0,
    uncertaintyAdjustmentCount: 0,
  };
}

function validateLayerAssetDraft(
  trial: TrialPlan,
  draft: LayerAssetDraft | undefined,
  previousAnswer: ModularAnswer | undefined,
  disclosureIndex: number,
) {
  if (!draft) return "本条曲线尚未完成作答。";
  const orderedBoundaries = [...draft.boundaries].sort((first, second) => first - second);
  if (trial.taskType === "T1") {
    if (orderedBoundaries.length === 0 && !draft.singleStageConfirmed) {
      return "请确认整条曲线只有一个阶段，或增加至少一个分界点。";
    }
    if (orderedBoundaries.length > 5) return "自由分期最多允许五个分界点（六个阶段）。";
  } else if (orderedBoundaries.length !== 2) {
    return "当前任务需要恰好两个分界点。";
  }
  if (orderedBoundaries.length > 0 && (
    draft.widths.length !== orderedBoundaries.length ||
    draft.widths.some((value) => value === null)
  )) {
    return "请拖动旋钮，为每个分界点确认一个连续的不确定范围。";
  }
  const previousRatios = previousAnswer?.boundaries.map((boundary) => boundary.ratio) ?? [];
  const sameAsPrevious = previousAnswer
    ? sameNumbers(orderedBoundaries, previousRatios) &&
      draft.widths.length === previousAnswer.boundaryIntervals.length &&
      draft.widths.every((value, index) => value === previousAnswer.boundaryIntervals[index]?.halfWidthRatio)
    : false;
  if (disclosureIndex > 0 && sameAsPrevious && !draft.noChangeConfirmed) {
    return "分界点和范围与上一层相同；请确认这是有意保持不变，或继续调整。";
  }
  if (draft.cueTags.length === 0) {
    return "请选择至少一项本层实际使用的判断线索。";
  }
  return "";
}

function LayerAssetResponseCard({
  bundle,
  trial,
  disclosureKey,
  disclosureIndex,
  disclosurePath,
  draft,
  previousAnswer,
  validationError,
  onChange,
}: {
  bundle: Bundle;
  trial: TrialPlan;
  disclosureKey: DisclosureKey;
  disclosureIndex: number;
  disclosurePath: DisclosurePath;
  draft: LayerAssetDraft;
  previousAnswer?: ModularAnswer;
  validationError?: string;
  onChange: (updater: (current: LayerAssetDraft) => LayerAssetDraft) => void;
}) {
  const context = resolveLayerTrialContext(bundle, trial, disclosureKey, disclosurePath);
  const activeCueSet = CUE_SETS[disclosureKey];
  const previousRatios = previousAnswer?.boundaries.map((boundary) => boundary.ratio) ?? [];
  const sameAsPrevious = previousAnswer
    ? sameNumbers([...draft.boundaries].sort((first, second) => first - second), previousRatios) &&
      draft.widths.length === previousAnswer.boundaryIntervals.length &&
      draft.widths.every((value, index) => value === previousAnswer.boundaryIntervals[index]?.halfWidthRatio)
    : false;
  const responseShapeReady = trial.taskType === "T1"
    ? (draft.boundaries.length === 0
        ? draft.singleStageConfirmed
        : draft.widths.length === draft.boundaries.length && draft.widths.every((value) => value !== null))
    : draft.boundaries.length === 2 && draft.widths.length === 2 && draft.widths.every((value) => value !== null);
  const complete = validateLayerAssetDraft(trial, draft, previousAnswer, disclosureIndex) === "";
  const noChangeId = `mod-no-change-${trial.id}-${disclosureIndex}`;

  const markBoundaryInteraction = () => {
    const now = performance.now();
    onChange((current) => ({
      ...current,
      firstMoveAt: current.firstMoveAt ?? now,
      lastInteractionAt: now,
      adjustmentCount: current.adjustmentCount + 1,
      noChangeConfirmed: false,
    }));
  };
  const markUncertaintyInteraction = () => {
    const now = performance.now();
    onChange((current) => ({
      ...current,
      firstUncertaintyAt: current.firstUncertaintyAt ?? now,
      lastInteractionAt: now,
      uncertaintyAdjustmentCount: current.uncertaintyAdjustmentCount + 1,
      noChangeConfirmed: false,
    }));
  };
  const toggleCue = (cue: CueOption) => {
    const exclusiveCodes = new Set(activeCueSet.options.filter((option) => option.exclusive).map((option) => option.code));
    onChange((current) => {
      if (cue.exclusive) {
        return { ...current, cueTags: current.cueTags.includes(cue.code) ? [] : [cue.code], lastInteractionAt: performance.now() };
      }
      const withoutExclusive = current.cueTags.filter((code) => !exclusiveCodes.has(code));
      return {
        ...current,
        cueTags: withoutExclusive.includes(cue.code)
          ? withoutExclusive.filter((code) => code !== cue.code)
          : [...withoutExclusive, cue.code],
        lastInteractionAt: performance.now(),
      };
    });
  };

  if (!context.metricData || !context.points.length) {
    return <article className="mod-layer-asset-card is-invalid"><p className="mod-error">这条曲线的数据无法载入。</p></article>;
  }

  return (
    <article className={`mod-layer-asset-card ${complete ? "is-ready" : ""} ${validationError ? "is-invalid" : ""}`} id={`layer-card-${trial.id}`}>
      <header className="mod-layer-card-head">
        <div>
          <span className="mod-layer-card-number">CURVE {String(trial.order + 1).padStart(2, "0")}</span>
          <h2>{context.visibility.asset ? `${context.displayName}（${context.displaySymbol}）` : context.visibility.metric ? context.metricData.name : `匿名曲线 ${trial.order + 1}`}</h2>
          <p>{context.visibility.intro
            ? context.displayIntro
            : context.visibility.metric
              ? metricDescriptionForDisclosure(trial.metric, context.visibility.axes, context.metricData.definition)
              : "请只根据当前可见的信息判断阶段结构。"}</p>
        </div>
        <span className={`mod-layer-card-status ${complete ? "is-complete" : ""}`}>{complete ? "已完成" : "待完成"}</span>
      </header>

      <div className="mod-condition-chips mod-layer-card-chips">
        <span>{context.visibility.metric ? context.metricData.name : "指标：？"}</span>
        <span>{context.visibility.axes ? `${RESOLUTION_LABEL[trial.resolution]} · ${trial.scaleMode === "log" ? "对数" : "线性"}` : "坐标：？"}</span>
        <span>{context.visibility.asset ? context.displaySymbol : "资产：？"}</span>
      </div>

      {trial.taskType === "T3" && <div className="mod-definition"><span>统一阶段定义</span><p>{STAGE_DEFINITION}</p></div>}

      <ModularChart
        points={context.points}
        metric={trial.metric}
        unit={context.metricData.unit}
        resolution={trial.resolution}
        scaleMode={trial.scaleMode}
        visibility={context.visibility}
        boundaries={draft.boundaries}
        widths={draft.widths}
        previousBoundaries={disclosureIndex > 0 ? previousRatios : []}
        events={context.visibleEvents}
        taskType={trial.taskType}
        onBoundariesChange={(values) => onChange((current) => ({
          ...current,
          boundaries: values,
          widths: current.widths.length === values.length ? current.widths : Array(values.length).fill(null),
        }))}
        onBoundaryInteraction={markBoundaryInteraction}
      />

      {(disclosureKey === "DI3" || disclosureKey === "DI4") && (
        <section className="mod-event-panel mod-layer-event-panel">
          <div className="mod-event-panel-head"><span className="mod-kicker">本层新增 · {disclosureKey === "DI3" ? "事件信息（一）" : "事件信息（二）"}</span><strong>{context.newlyDisclosedEvents.length} 项 · 上限 {MAX_EVENTS_PER_DISCLOSURE}</strong></div>
          {context.retainedEventCount > 0 && <p className="mod-event-retained">上一层的 {context.retainedEventCount} 个事件继续保留；下方只列出本层新增内容。</p>}
          {context.newlyDisclosedEvents.length ? (
            <div className="mod-event-list">
              {context.newlyDisclosedEvents.map((event) => (
                <article key={event.sourceId ?? `${event.date}-${event.title}`}><time>{event.date}</time><h3>{event.title}</h3><p>{event.description}</p></article>
              ))}
            </div>
          ) : <p className="mod-event-empty">当前显示时间窗内没有可展示的新增事件。</p>}
        </section>
      )}

      <div className="mod-layer-card-response">
        <BoundaryEditor
          taskType={trial.taskType}
          boundaries={draft.boundaries}
          widths={draft.widths}
          points={context.points}
          singleStageConfirmed={draft.singleStageConfirmed}
          onSingleStageConfirmed={(value) => onChange((current) => ({ ...current, singleStageConfirmed: value, lastInteractionAt: performance.now() }))}
          onBoundariesChange={(values) => onChange((current) => ({ ...current, boundaries: values }))}
          onWidthsChange={(values) => onChange((current) => ({ ...current, widths: values }))}
          onBoundaryInteraction={markBoundaryInteraction}
          onUncertaintyInteraction={markUncertaintyInteraction}
          showDates={context.visibility.axes}
        />

        {disclosureIndex > 0 && (
          <section className="mod-question-block is-new">
            <span className="mod-new-flag">NEW · 本层新增信息</span>
            <h3>这一层新增的信息，对你的判断影响有多大？</h3>
            <Rating value={draft.influence} onChange={(value) => onChange((current) => ({ ...current, influence: value, influenceTouched: true, lastInteractionAt: performance.now() }))} left="几乎没有" right="影响很大" label={`曲线 ${trial.order + 1} 新增信息影响`} />
            {sameAsPrevious && (
              <div className="mod-confirm-row compact"><input id={noChangeId} type="checkbox" checked={draft.noChangeConfirmed} onChange={(event) => onChange((current) => ({ ...current, noChangeConfirmed: event.target.checked, lastInteractionAt: performance.now() }))} /><label htmlFor={noChangeId}><strong>我确认有意保持不变</strong><small>分界点和范围与上一层一致。</small></label></div>
            )}
          </section>
        )}

        {responseShapeReady ? (
          <section className="mod-question-block">
            <h3>{activeCueSet.question}<small>可多选</small></h3>
            <div className="mod-cue-groups">
              <div className="mod-cue-group">
                <span>{activeCueSet.eyebrow}</span>
                <div className="mod-cue-list">
                  {activeCueSet.options.map((cue) => (
                    <button type="button" key={cue.code} className={draft.cueTags.includes(cue.code) ? "is-selected" : ""} aria-pressed={draft.cueTags.includes(cue.code)} onClick={() => toggleCue(cue)}>{cue.label}</button>
                  ))}
                </div>
              </div>
              <p className="mod-cue-note">{activeCueSet.note} 至少选择一项；“没有改变”与其他选项互斥。</p>
            </div>
            <label className="mod-rationale"><span>还想补充什么？<small>可不填</small></span><textarea value={draft.rationale} maxLength={1000} onChange={(event) => onChange((current) => ({ ...current, rationale: event.target.value, lastInteractionAt: performance.now() }))} placeholder="例如：这里开始由持续上涨转为高位震荡……" /><i>{draft.rationale.length}/1000</i></label>
          </section>
        ) : (
          <section className="mod-question-block mod-cue-awaiting">
            <span className="mod-kicker">完成分界判断后出现</span>
            <h3>判断依据</h3>
            <p>先确定分界点及其大致范围，随后再记录你实际使用的线索，避免选项提前影响分界。</p>
          </section>
        )}
      </div>

      {validationError && <p className="mod-error mod-layer-card-error" role="alert">{validationError}</p>}
    </article>
  );
}

export function ExperimentModular({
  protocolVariant = "v4",
  entryMode = "console",
}: {
  protocolVariant?: ProtocolVariant;
  entryMode?: EntryMode;
}) {
  const isV4 = protocolVariant === "v4";
  const isPilot = entryMode === "pilot";
  const isM1Main = entryMode === "m1";
  const isFixedM1 = isPilot || isM1Main;
  const sessionProtocolVersion = isM1Main
    ? "m1-human-main-v4.6-blank-baseline"
    : isPilot
      ? "m1-pilot-v4.6-blank-baseline"
      : "";
  const activeResponseVersion = isFixedM1 ? "v4.6-blank-baseline" : isV4 ? "v4.1" : "pre-v4";
  const baselinePlacementProtocol = isFixedM1 ? "blank-two-click-placement-v1" : "preset-task-defaults-v1";
  const editionMark = isV4 ? "04" : "06";
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [moduleKey, setModuleKey] = useState<ModuleKey>("disclosure");
  const usesLayerMajorDisclosureFlow = isV4 && moduleKey === "disclosure";
  const usesFixedM1SequentialPages = usesLayerMajorDisclosureFlow && isFixedM1;
  const [taskType, setTaskType] = useState<TaskType>("T2");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [resolution, setResolution] = useState<Resolution>("weekly");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const [windowMode, setWindowMode] = useState<WindowMode>("whole");
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
  const [boundaries, setBoundaries] = useState<number[]>(() => initialBoundaries("T2", isFixedM1));
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
  const [layerDrafts, setLayerDrafts] = useState<Record<string, LayerAssetDraft>>({});
  const [layerValidationErrors, setLayerValidationErrors] = useState<Record<string, string>>({});
  const [batchProgress, setBatchProgress] = useState({ completed: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [uncertaintyAdjustmentCount, setUncertaintyAdjustmentCount] = useState(0);
  const stepStartedAt = useRef(0);
  const firstMoveAt = useRef<number | null>(null);
  const firstUncertaintyAt = useRef<number | null>(null);
  const layerStartedAt = useRef(0);
  const sessionDeviceInfo = useRef<DeviceInfo | null>(null);
  const stepStartedWallAt = useRef("");
  const stepHiddenStartedAt = useRef<number | null>(null);
  const stepHiddenAccumulatedMs = useRef(0);
  const resumeAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(isV4 ? "/data/research-stimuli-modular-v8.json" : "/data/research-stimuli-modular-v6.json")
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
  }, [isV4]);

  useEffect(() => {
    if (phase !== "experiment") return;
    stepStartedAt.current = performance.now();
    stepStartedWallAt.current = new Date().toISOString();
    firstMoveAt.current = null;
    firstUncertaintyAt.current = null;
    stepHiddenAccumulatedMs.current = 0;
    stepHiddenStartedAt.current = document.hidden ? performance.now() : null;
    const handleVisibilityChange = () => {
      const now = performance.now();
      if (document.hidden) {
        if (stepHiddenStartedAt.current === null) stepHiddenStartedAt.current = now;
      } else if (stepHiddenStartedAt.current !== null) {
        stepHiddenAccumulatedMs.current += now - stepHiddenStartedAt.current;
        stepHiddenStartedAt.current = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [phase, trialIndex, disclosureIndex]);

  const currentTrial = plan[trialIndex];
  const currentDisclosure = currentTrial?.disclosures[disclosureIndex];
  const activeCueSet = currentDisclosure ? CUE_SETS[currentDisclosure] : CUE_SETS.G0;
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
  const curatedStart = bundle?.curatedWindow?.start ?? "2020-01-01";
  const curatedEnd = bundle?.curatedWindow?.end ?? "2024-12-31";
  const legacyTruncatedStart = Math.floor(sourcePoints.length * 0.27);
  const legacyTruncatedEnd = Math.max(legacyTruncatedStart + 4, Math.ceil(sourcePoints.length * 0.78));
  const points = currentTrial?.windowMode === "truncated"
    ? isV4
      ? sourcePoints.filter((point) => point.date >= curatedStart && point.date <= curatedEnd)
      : sourcePoints.slice(legacyTruncatedStart, legacyTruncatedEnd)
    : sourcePoints;
  const sourceWindow = sourcePoints.length
    ? { start: sourcePoints[0].date, end: sourcePoints[sourcePoints.length - 1].date, observationCount: sourcePoints.length }
    : null;
  const displayedWindow = points.length
    ? { start: points[0].date, end: points[points.length - 1].date, observationCount: points.length }
    : null;
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
  const eventWindowStart = points[0]?.date ?? "0000-01-01";
  const eventWindowEnd = points[points.length - 1]?.date ?? "9999-12-31";
  const coreEvents = selectDisclosureEvents(allEvents, "core", eventWindowStart, eventWindowEnd);
  const supplementaryEvents = selectDisclosureEvents(allEvents, "supplementary", eventWindowStart, eventWindowEnd);
  const visibleEvents = [
    ...(visibility.highEvents ? coreEvents : []),
    ...(visibility.lowEvents ? supplementaryEvents : []),
  ].sort((first, second) => first.date.localeCompare(second.date));
  const newlyDisclosedEvents = currentDisclosure === "DI3"
    ? coreEvents
    : currentDisclosure === "DI4"
      ? supplementaryEvents
      : currentDisclosure === "FULL"
        ? visibleEvents
        : [];
  const retainedEventCount = Math.max(0, visibleEvents.length - newlyDisclosedEvents.length);
  const displayName = currentControl?.nameZh ?? currentAsset?.nameZh ?? "匿名序列";
  const displaySymbol = currentControl?.symbol ?? currentAsset?.symbol ?? "";
  const displayIntro = currentControl?.intro ?? currentAsset?.intro ?? "";

  useEffect(() => {
    if (!isM1Main || !bundle || resumeAttempted.current) return;
    const params = new URLSearchParams(window.location.search);
    const resumeSessionId = params.get("resumeSession")?.trim() ?? "";
    const resumeParticipantCode = params.get("participantCode")?.trim() ?? "";
    if (!resumeSessionId && !resumeParticipantCode) return;
    resumeAttempted.current = true;

    const restore = async () => {
      setBusy(true);
      setError("");
      try {
        if (!resumeSessionId || !resumeParticipantCode) {
          throw new Error("恢复链接缺少完整会话 ID 或参与者编号。");
        }
        const query = new URLSearchParams({
          sessionId: resumeSessionId,
          participantCode: resumeParticipantCode,
        });
        const response = await fetch(`/api/sessions?${query.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as ResumeSessionPayload;
        if (!response.ok || !payload.session || !Array.isArray(payload.answers)) {
          throw new Error(payload.error ?? "会话恢复失败");
        }
        const restoredPlan = payload.session.studyConfig.randomizedPlan;
        if (
          !Array.isArray(restoredPlan) ||
          !restoredPlan.length ||
          restoredPlan.some((trial) =>
            !trial ||
            typeof trial !== "object" ||
            typeof (trial as TrialPlan).id !== "string" ||
            !Array.isArray((trial as TrialPlan).disclosures),
          )
        ) {
          throw new Error("原会话的随机化计划无效，无法安全恢复。");
        }

        const nextPlan = restoredPlan as TrialPlan[];
        const restoredAnswers = payload.answers;
        const completedKeys = new Set(
          restoredAnswers.map((answer) => `${answer.trialId}:${answer.disclosureIndex}`),
        );
        let nextPosition: { trialIndex: number; disclosureIndex: number } | null = null;
        const disclosureCount = nextPlan.reduce(
          (maximum, trial) => Math.max(maximum, trial.disclosures.length),
          0,
        );
        for (let nextDisclosureIndex = 0; nextDisclosureIndex < disclosureCount && !nextPosition; nextDisclosureIndex += 1) {
          for (let nextTrialIndex = 0; nextTrialIndex < nextPlan.length; nextTrialIndex += 1) {
            const trial = nextPlan[nextTrialIndex];
            if (
              trial.disclosures[nextDisclosureIndex] &&
              !completedKeys.has(`${trial.id}:${nextDisclosureIndex}`)
            ) {
              nextPosition = { trialIndex: nextTrialIndex, disclosureIndex: nextDisclosureIndex };
              break;
            }
          }
        }

        const config = payload.session.studyConfig;
        setModuleKey("disclosure");
        setTaskType("T2");
        setMetric("price");
        setResolution("weekly");
        setScaleMode("linear");
        setWindowMode("whole");
        setDisclosurePath((config.disclosurePath as DisclosurePath | undefined) ?? "combined");
        setParticipantCode(payload.session.participantCode);
        setExpertise(payload.session.expertise);
        setPlan(nextPlan);
        setSessionId(payload.session.id);
        setAnswers(restoredAnswers);
        setLayerDrafts({});
        setLayerValidationErrors({});
        setBatchProgress({ completed: 0, total: nextPlan.length });
        sessionDeviceInfo.current = collectDeviceInfo();

        if (!nextPosition) {
          setTrialIndex(Math.max(0, nextPlan.length - 1));
          setDisclosureIndex(Math.max(0, disclosureCount - 1));
          setPhase("review");
          return;
        }

        const nextTrial = nextPlan[nextPosition.trialIndex];
        const seedAnswer = restoredAnswers
          .filter((answer) =>
            answer.trialId === nextTrial.id &&
            answer.disclosureIndex < nextPosition!.disclosureIndex,
          )
          .sort((first, second) => second.disclosureIndex - first.disclosureIndex)[0];
        const restoredBoundaries = seedAnswer
          ? seedAnswer.boundaries.map((boundary) => boundary.ratio)
          : initialBoundaries(nextTrial.taskType, true);
        const restoredWidths = seedAnswer
          ? restoredBoundaries.map((_, index) =>
              seedAnswer.boundaryIntervals.find((interval) => interval.boundaryIndex === index)?.halfWidthRatio ?? null,
            )
          : Array(restoredBoundaries.length).fill(null);
        setTrialIndex(nextPosition.trialIndex);
        setDisclosureIndex(nextPosition.disclosureIndex);
        setBoundaries(restoredBoundaries);
        setWidths(restoredWidths);
        setSingleStageConfirmed(seedAnswer?.singleStageConfirmed ?? false);
        setInfluence(3);
        setInfluenceTouched(false);
        setNoChangeConfirmed(false);
        setCueTags([]);
        setRationale("");
        setAdjustmentCount(0);
        setUncertaintyAdjustmentCount(0);
        firstMoveAt.current = null;
        firstUncertaintyAt.current = null;
        setPhase("experiment");
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "会话恢复失败");
      } finally {
        setBusy(false);
      }
    };

    void restore();
  }, [bundle, isM1Main]);

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

  const resetResponseState = (
    nextTask: TaskType,
    preserve = false,
    seedAnswer?: ModularAnswer,
  ) => {
    const nextBoundaries = seedAnswer
      ? seedAnswer.boundaries.map((boundary) => boundary.ratio)
      : preserve
        ? boundaries
        : initialBoundaries(nextTask, isFixedM1);
    const seededWidths = seedAnswer
      ? nextBoundaries.map((_, index) =>
          seedAnswer.boundaryIntervals.find((interval) => interval.boundaryIndex === index)?.halfWidthRatio ?? null,
        )
      : null;
    setBoundaries(nextBoundaries);
    setWidths(seededWidths ?? (preserve ? widths : Array(nextBoundaries.length).fill(null)));
    setSingleStageConfirmed(seedAnswer ? seedAnswer.singleStageConfirmed : preserve ? singleStageConfirmed : false);
    if (!isV4) {
      setConfidence(3);
      setConfidenceTouched(false);
    }
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

  const priorAnswerForPosition = (
    nextTrial: TrialPlan,
    nextDisclosureIndex: number,
    answerPool: ModularAnswer[],
  ) => answerPool
    .filter((answer) => answer.trialId === nextTrial.id && answer.disclosureIndex < nextDisclosureIndex)
    .sort((first, second) => second.disclosureIndex - first.disclosureIndex)[0];

  const enterCurrentDisclosureLayer = () => {
    if (usesFixedM1SequentialPages) {
      setPhase("experiment");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    const nextDrafts = Object.fromEntries(plan.map((trial) => [
      trial.id,
      makeLayerAssetDraft(trial, priorAnswerForPosition(trial, disclosureIndex, answers)),
    ]));
    setLayerDrafts(nextDrafts);
    setLayerValidationErrors({});
    setBatchProgress({ completed: 0, total: plan.length });
    layerStartedAt.current = performance.now();
    setPhase("experiment");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const toggleCue = (cue: CueOption) => {
    const exclusiveCodes = new Set(activeCueSet.options.filter((option) => option.exclusive).map((option) => option.code));
    setCueTags((value) => {
      if (cue.exclusive) return value.includes(cue.code) ? [] : [cue.code];
      const withoutExclusive = value.filter((code) => !exclusiveCodes.has(code));
      return withoutExclusive.includes(cue.code)
        ? withoutExclusive.filter((code) => code !== cue.code)
        : [...withoutExclusive, cue.code];
    });
  };

  const createSession = async (nextPlan: TrialPlan[]) => {
    if (!bundle) throw new Error("研究刺激数据尚未载入。");
    const deviceInfo = collectDeviceInfo();
    sessionDeviceInfo.current = deviceInfo;
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorType,
        participantCode,
        expertise,
        experimentalArm: isM1Main ? "m1-main" : isPilot ? "pilot-m1" : moduleKey,
        protocolVersion: isFixedM1 ? sessionProtocolVersion : bundle.protocolVersion,
        modelName: actorType === "agent" ? modelName : null,
        deviceInfo,
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
          windowMode: isV4 ? windowMode : "whole",
          windowProtocol: isV4 ? bundle.curatedWindow ?? null : null,
          participantBriefingVersion: isV4 ? "participant-briefing-v2-device-telemetry" : null,
          cueSchemaVersion: isFixedM1 ? "none" : isV4 ? CUE_SCHEMA_VERSION : "legacy-cues-v1",
          cueTaxonomyUrl: isFixedM1 ? null : isV4 ? "/data/cue-taxonomy-v4-v2.json" : null,
          entryMode,
          pilotProtocol: isPilot ? "m1-pilot-v4.6-blank-baseline" : null,
          mainStudyProtocol: isM1Main ? "m1-human-main-v4.6-blank-baseline" : null,
          validityRepairVersion: isFixedM1 ? "early-disclosure-and-feedback-bias-v1" : null,
          disclosureFlowOrder: usesLayerMajorDisclosureFlow ? "disclosure-major" : "asset-major",
          layerPresentation: usesFixedM1SequentialPages
            ? "sequential-single-asset-pages-v1"
            : usesLayerMajorDisclosureFlow
            ? nextPlan.length === 6 ? "simultaneous-six-asset-page-v1" : "simultaneous-multi-asset-page-v1"
            : "single-stimulus-page",
          responseTimingProtocol: usesFixedM1SequentialPages ? "step-start-to-submit-v1" : usesLayerMajorDisclosureFlow ? "layer-start-to-last-asset-interaction-v1" : "step-start-to-submit-v1",
          deviceTelemetryProtocol: isFixedM1 ? "session-device-environment-v1" : null,
          responseTelemetryProtocol: isFixedM1 ? "per-page-visible-time-v1" : null,
          participantQuestionSet: isFixedM1 ? "boundaries-uncertainty-influence-v1" : "full-annotation-v2",
          uncertaintyControl: isFixedM1 ? "continuous-range-knob-zero-enabled-v2" : isV4 ? "continuous-range-knob-v1" : "preset-widths-v1",
          baselinePlacementProtocol,
          stimulusProtocolVersion: bundle.protocolVersion,
          stimulusDatasetVersion: isV4 ? "research-stimuli-modular-v8" : "research-stimuli-modular-v6",
          eventSelectionProtocol: isV4 ? EVENT_SELECTION_PROTOCOL : null,
          maximumNewEventsPerDisclosure: isV4 ? MAX_EVENTS_PER_DISCLOSURE : null,
          eventPriorityBands: isV4 ? { DI3: [1, 2], DI4: [3, 4, 5] } : null,
          assetCount: nextPlan.length,
          randomizedPlan: nextPlan,
        },
      }),
    });
    const payload = (await response.json()) as { session?: { id: string }; error?: string };
    if (!response.ok || !payload.session?.id) throw new Error(payload.error ?? "实验会话创建失败");
    return payload.session.id;
  };

  const begin = async () => {
    if (!bundle || (!isV4 && !consent)) return;
    setBusy(true);
    setError("");
    try {
      if (isFixedM1 && !participantCode.trim()) {
        throw new Error("请输入研究者提供的匿名参与者编号。");
      }
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
        windowMode: isV4 ? windowMode : "whole",
      });
      if (!nextPlan.length) throw new Error("当前条件没有可用曲线，请调整研究配置。");
      setPlan(nextPlan);
      setTrialIndex(0);
      setDisclosureIndex(0);
      setAnswers([]);
      setLayerDrafts({});
      setLayerValidationErrors({});
      setBatchProgress({ completed: 0, total: nextPlan.length });
      resetResponseState(nextPlan[0].taskType, false);
      if (isV4) {
        setConsent(false);
        setPhase("briefing");
      } else {
        setSessionId(await createSession(nextPlan));
        setPhase("experiment");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "实验启动失败");
    } finally {
      setBusy(false);
    }
  };

  const startParticipantSession = async () => {
    if (!bundle || !plan.length || !consent) return;
    setBusy(true);
    setError("");
    try {
      setSessionId(await createSession(plan));
      setPhase(usesLayerMajorDisclosureFlow ? "transition" : "experiment");
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
      setError("请拖动旋钮，为每个分界点确认一个连续的不确定范围。");
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
    if (isV4 && !isFixedM1 && cueTags.length === 0) {
      setError("请选择至少一项本步实际使用的判断线索；如果新增信息没有影响，请选择“没有改变我的判断”。");
      return;
    }

    setBusy(true);
    setError("");
    const now = submitTimestamp;
    const elapsedMs = Math.max(0, Math.round(now - stepStartedAt.current));
    const hiddenMsAtSubmit = stepHiddenAccumulatedMs.current +
      (stepHiddenStartedAt.current === null ? 0 : Math.max(0, now - stepHiddenStartedAt.current));
    const pageHiddenMs = Math.min(elapsedMs, Math.max(0, Math.round(hiddenMsAtSubmit)));
    const activeElapsedMs = Math.max(0, elapsedMs - pageHiddenMs);
    const clientStartedAt = stepStartedWallAt.current ||
      new Date(performance.timeOrigin + now - elapsedMs).toISOString();
    const clientSubmittedAt = new Date(performance.timeOrigin + now).toISOString();
    const responseViewportWidth = Math.max(1, Math.round(window.innerWidth));
    const responseViewportHeight = Math.max(1, Math.round(window.innerHeight));
    const responseOrientation = currentOrientation();
    const stimulusType = currentControl?.kind ?? "crypto";
    const disclosureState = {
      key: currentDisclosure,
      path: currentTrial.module === "disclosure" ? disclosurePath : "snapshot",
      visibility,
      cueSchemaVersion: isV4 ? CUE_SCHEMA_VERSION : "legacy-cues-v1",
      cueSetKey: isV4 ? currentDisclosure : null,
      sourceWindow,
      displayedWindow,
      curatedWindow: currentTrial.windowMode === "truncated" ? bundle.curatedWindow ?? { start: curatedStart, end: curatedEnd } : null,
      visibleEventPriorities: [
        ...(visibility.highEvents ? ["high"] : []),
        ...(visibility.lowEvents ? ["low"] : []),
      ],
      visibleSourcePriorities: [...new Set(visibleEvents.map(eventSourcePriority))].sort((first, second) => first - second),
      baselinePlacementProtocol,
      boundaryInteractionSemantics: isFixedM1 ? {
        initialPlacementCount: disclosureIndex === 0 ? Math.min(adjustmentCount, 2) : 0,
        revisionAdjustmentCount: disclosureIndex === 0 ? Math.max(0, adjustmentCount - 2) : adjustmentCount,
        firstBoundaryInteractionMeaning: disclosureIndex === 0 ? "initial-placement-latency" : "revision-latency",
      } : null,
      eventProtocol: {
        version: EVENT_SELECTION_PROTOCOL,
        sourceDataset: "events_20260527.zip",
        priorityBands: { core: [1, 2], supplementary: [3, 4, 5] },
        maximumNewEventsPerDisclosure: MAX_EVENTS_PER_DISCLOSURE,
        overflowRule: "chronological-even-spacing-with-endpoints",
        activeNewBand: currentDisclosure === "DI3" ? "core" : currentDisclosure === "DI4" ? "supplementary" : null,
        newlyDisclosedEventIds: newlyDisclosedEvents.map((event) => event.sourceId ?? `${event.date}:${event.title}`),
        retainedEventIds: visibleEvents
          .filter((event) => !newlyDisclosedEvents.includes(event))
          .map((event) => event.sourceId ?? `${event.date}:${event.title}`),
      },
    };
    const stimulusWindow = {
      mode: currentTrial.windowMode,
      source: sourceWindow,
      displayed: displayedWindow,
      curatedRule: currentTrial.windowMode === "truncated" ? bundle.curatedWindow ?? { start: curatedStart, end: curatedEnd } : null,
    };
    const revealReadMs = Math.round((firstMoveAt.current ?? firstUncertaintyAt.current ?? now) - stepStartedAt.current);
    const firstMoveMs = firstMoveAt.current === null ? null : Math.round(firstMoveAt.current - stepStartedAt.current);
    const firstUncertaintyMs = firstUncertaintyAt.current === null ? null : Math.round(firstUncertaintyAt.current - stepStartedAt.current);
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
          responseVersion: activeResponseVersion,
          stimulusWindow,
          cueSchemaVersion: isFixedM1 ? "none" : isV4 ? CUE_SCHEMA_VERSION : "legacy-cues-v1",
          boundaries: currentBoundaryRecords,
          previousBoundaries: previousAnswer?.boundaries ?? [],
          boundaryIntervals: currentIntervalRecords,
          singleStageConfirmed,
          confidence: isV4 ? undefined : confidence,
          confidenceTouched: isV4 ? false : confidenceTouched,
          influenceRating: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influence : null,
          influenceTouched: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influenceTouched : false,
          noChangeConfirmed,
          cueTags: isFixedM1 ? [] : cueTags,
          rationale: isFixedM1 ? "" : rationale,
          elapsedMs,
          revealReadMs,
          firstMoveMs,
          firstUncertaintyMs,
          adjustmentCount,
          uncertaintyAdjustmentCount,
          clientStartedAt,
          clientSubmittedAt,
          responseViewportWidth,
          responseViewportHeight,
          responseOrientation,
          pageHiddenMs,
          activeElapsedMs,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "本轮记录失败");
      const answer: ModularAnswer = {
        responseVersion: activeResponseVersion,
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
        confidence: isV4 ? undefined : confidence,
        influenceRating: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influence : null,
        influenceTouched: currentTrial.module === "disclosure" && disclosureIndex > 0 ? influenceTouched : false,
        noChangeConfirmed,
        cueTags: isFixedM1 ? [] : cueTags,
        rationale: isFixedM1 ? "" : rationale,
        stimulusType,
        resolution: currentTrial.resolution,
        scaleMode: currentTrial.scaleMode,
        windowMode: currentTrial.windowMode,
        disclosureState,
        stimulusWindow,
        elapsedMs,
        revealReadMs,
        firstMoveMs,
        firstUncertaintyMs,
        adjustmentCount,
        uncertaintyAdjustmentCount,
        clientStartedAt,
        clientSubmittedAt,
        responseViewportWidth,
        responseViewportHeight,
        responseOrientation,
        pageHiddenMs,
        activeElapsedMs,
      };
      const nextAnswers = [...answers, answer];
      setAnswers(nextAnswers);
      if (usesLayerMajorDisclosureFlow) {
        if (trialIndex < plan.length - 1) {
          const nextTrialIndex = trialIndex + 1;
          const nextTrial = plan[nextTrialIndex];
          const seedAnswer = priorAnswerForPosition(nextTrial, disclosureIndex, nextAnswers);
          setTrialIndex(nextTrialIndex);
          resetResponseState(nextTrial.taskType, false, seedAnswer);
          window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        } else {
          setPhase("review");
        }
      } else if (disclosureIndex < currentTrial.disclosures.length - 1) {
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

  const submitDisclosureLayer = async () => {
    if (!bundle || !sessionId || !currentDisclosure || !plan.length) return;
    const validationEntries = plan.map((trial) => {
      const previous = priorAnswerForPosition(trial, disclosureIndex, answers);
      return [trial.id, validateLayerAssetDraft(trial, layerDrafts[trial.id], previous, disclosureIndex)] as const;
    });
    const validationErrors = Object.fromEntries(validationEntries.filter(([, message]) => Boolean(message)));
    if (Object.keys(validationErrors).length) {
      setLayerValidationErrors(validationErrors);
      setError(`还有 ${Object.keys(validationErrors).length} 条曲线尚未完成，请查看红色提示。`);
      const firstInvalid = plan.find((trial) => validationErrors[trial.id]);
      if (firstInvalid) document.getElementById(`layer-card-${firstInvalid.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setBusy(true);
    setError("");
    setLayerValidationErrors({});
    let nextAnswers = [...answers];
    const alreadySaved = plan.filter((trial) => nextAnswers.some((answer) => answer.trialId === trial.id && answer.disclosureIndex === disclosureIndex)).length;
    setBatchProgress({ completed: alreadySaved, total: plan.length });

    try {
      for (const trial of plan) {
        if (nextAnswers.some((answer) => answer.trialId === trial.id && answer.disclosureIndex === disclosureIndex)) continue;
        const draft = layerDrafts[trial.id];
        const context = resolveLayerTrialContext(bundle, trial, currentDisclosure, disclosurePath);
        if (!draft || !context.metricData || !context.points.length) throw new Error(`曲线 ${trial.order + 1} 的数据无法载入。`);
        const orderedPairs = draft.boundaries
          .map((ratio, index) => ({ ratio, width: draft.widths[index] ?? null }))
          .sort((first, second) => first.ratio - second.ratio);
        const orderedBoundaries = orderedPairs.map((item) => item.ratio);
        const orderedWidths = orderedPairs.map((item) => item.width);
        const currentBoundaryRecords = boundaryRecords(orderedBoundaries, context.points);
        const currentIntervalRecords = intervalRecords(orderedBoundaries, orderedWidths, context.points);
        const previousAnswer = priorAnswerForPosition(trial, disclosureIndex, nextAnswers);
        const now = performance.now();
        const elapsedMs = Math.max(0, Math.round((draft.lastInteractionAt ?? now) - layerStartedAt.current));
        const firstInteraction = draft.firstMoveAt ?? draft.firstUncertaintyAt ?? now;
        const disclosureState = {
          key: currentDisclosure,
          path: disclosurePath,
          visibility: context.visibility,
          cueSchemaVersion: CUE_SCHEMA_VERSION,
          cueSetKey: currentDisclosure,
          sourceWindow: context.sourceWindow,
          displayedWindow: context.displayedWindow,
          curatedWindow: trial.windowMode === "truncated" ? bundle.curatedWindow ?? null : null,
          layerPresentation: plan.length === 6 ? "simultaneous-six-asset-page-v1" : "simultaneous-multi-asset-page-v1",
          timingProtocol: "layer-start-to-last-asset-interaction-v1",
          visibleEventPriorities: [
            ...(context.visibility.highEvents ? ["high"] : []),
            ...(context.visibility.lowEvents ? ["low"] : []),
          ],
          visibleSourcePriorities: [...new Set(context.visibleEvents.map(eventSourcePriority))].sort((first, second) => first - second),
          eventProtocol: {
            version: EVENT_SELECTION_PROTOCOL,
            sourceDataset: "events_20260527.zip",
            priorityBands: { core: [1, 2], supplementary: [3, 4, 5] },
            maximumNewEventsPerDisclosure: MAX_EVENTS_PER_DISCLOSURE,
            overflowRule: "chronological-even-spacing-with-endpoints",
            activeNewBand: currentDisclosure === "DI3" ? "core" : currentDisclosure === "DI4" ? "supplementary" : null,
            newlyDisclosedEventIds: context.newlyDisclosedEvents.map((event) => event.sourceId ?? `${event.date}:${event.title}`),
            retainedEventIds: context.visibleEvents
              .filter((event) => !context.newlyDisclosedEvents.includes(event))
              .map((event) => event.sourceId ?? `${event.date}:${event.title}`),
          },
        };
        const stimulusWindow = {
          mode: trial.windowMode,
          source: context.sourceWindow,
          displayed: context.displayedWindow,
          curatedRule: trial.windowMode === "truncated" ? bundle.curatedWindow ?? null : null,
        };
        const stimulusType = context.control?.kind ?? "crypto";
        const response = await fetch("/api/modular-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            trialId: trial.id,
            trialOrder: trial.order,
            moduleKey: trial.module,
            taskType: trial.taskType,
            stimulusType,
            assetId: trial.assetId,
            metricType: trial.metric,
            resolution: trial.resolution,
            scaleMode: trial.scaleMode,
            windowMode: trial.windowMode,
            disclosureIndex,
            disclosureKey: currentDisclosure,
            disclosureState,
            responseVersion: "v4.1",
            stimulusWindow,
            cueSchemaVersion: CUE_SCHEMA_VERSION,
            boundaries: currentBoundaryRecords,
            previousBoundaries: previousAnswer?.boundaries ?? [],
            boundaryIntervals: currentIntervalRecords,
            singleStageConfirmed: draft.singleStageConfirmed,
            influenceRating: disclosureIndex > 0 ? draft.influence : null,
            influenceTouched: disclosureIndex > 0 ? draft.influenceTouched : false,
            noChangeConfirmed: draft.noChangeConfirmed,
            cueTags: draft.cueTags,
            rationale: draft.rationale,
            elapsedMs,
            revealReadMs: Math.max(0, Math.round(firstInteraction - layerStartedAt.current)),
            firstMoveMs: draft.firstMoveAt === null ? null : Math.max(0, Math.round(draft.firstMoveAt - layerStartedAt.current)),
            firstUncertaintyMs: draft.firstUncertaintyAt === null ? null : Math.max(0, Math.round(draft.firstUncertaintyAt - layerStartedAt.current)),
            adjustmentCount: draft.adjustmentCount,
            uncertaintyAdjustmentCount: draft.uncertaintyAdjustmentCount,
          }),
        });
        const payload = (await response.json()) as { error?: string };
        const alreadyRecorded = payload.error === "This trial disclosure has already been submitted.";
        if (!response.ok && !alreadyRecorded) throw new Error(payload.error ?? `曲线 ${trial.order + 1} 记录失败`);

        const answer: ModularAnswer = {
          responseVersion: "v4.1",
          trialId: trial.id,
          trialOrder: trial.order,
          disclosureIndex,
          disclosureKey: currentDisclosure,
          taskType: trial.taskType,
          assetId: trial.assetId,
          metric: trial.metric,
          boundaries: currentBoundaryRecords,
          previousBoundaries: previousAnswer?.boundaries ?? [],
          boundaryIntervals: currentIntervalRecords,
          singleStageConfirmed: draft.singleStageConfirmed,
          influenceRating: disclosureIndex > 0 ? draft.influence : null,
          influenceTouched: disclosureIndex > 0 ? draft.influenceTouched : false,
          noChangeConfirmed: draft.noChangeConfirmed,
          cueTags: draft.cueTags,
          rationale: draft.rationale,
          stimulusType,
          resolution: trial.resolution,
          scaleMode: trial.scaleMode,
          windowMode: trial.windowMode,
          disclosureState,
          stimulusWindow,
          elapsedMs,
          revealReadMs: Math.max(0, Math.round(firstInteraction - layerStartedAt.current)),
          firstMoveMs: draft.firstMoveAt === null ? null : Math.max(0, Math.round(draft.firstMoveAt - layerStartedAt.current)),
          firstUncertaintyMs: draft.firstUncertaintyAt === null ? null : Math.max(0, Math.round(draft.firstUncertaintyAt - layerStartedAt.current)),
          adjustmentCount: draft.adjustmentCount,
          uncertaintyAdjustmentCount: draft.uncertaintyAdjustmentCount,
        };
        nextAnswers = [...nextAnswers, answer];
        setAnswers(nextAnswers);
        setBatchProgress({
          completed: plan.filter((candidate) => nextAnswers.some((candidateAnswer) => candidateAnswer.trialId === candidate.id && candidateAnswer.disclosureIndex === disclosureIndex)).length,
          total: plan.length,
        });
      }
      setTrialIndex(0);
      setPhase("review");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (reason) {
      const saved = plan.filter((trial) => nextAnswers.some((answer) => answer.trialId === trial.id && answer.disclosureIndex === disclosureIndex)).length;
      setError(`${reason instanceof Error ? reason.message : "本层记录失败"} 已安全保存 ${saved}/${plan.length} 条；请重试，已保存内容不会重复写入。`);
    } finally {
      setBusy(false);
    }
  };

  const continueAfterReview = async () => {
    if (usesLayerMajorDisclosureFlow && currentTrial && disclosureIndex < currentTrial.disclosures.length - 1) {
      const nextDisclosureIndex = disclosureIndex + 1;
      const nextTrial = plan[0];
      const seedAnswer = priorAnswerForPosition(nextTrial, nextDisclosureIndex, answers);
      setTrialIndex(0);
      setDisclosureIndex(nextDisclosureIndex);
      resetResponseState(nextTrial.taskType, false, seedAnswer);
      setPhase("transition");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    if (!usesLayerMajorDisclosureFlow && trialIndex < plan.length - 1) {
      const nextIndex = trialIndex + 1;
      setTrialIndex(nextIndex);
      setDisclosureIndex(0);
      resetResponseState(plan[nextIndex].taskType, false);
      setPhase("experiment");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "会话完成状态写入失败");
      setPhase("complete");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "会话完成状态写入失败");
    } finally {
      setBusy(false);
    }
  };

  const moduleInfo = MODULES.find((item) => item.key === moduleKey) ?? MODULES[0];

  if (phase === "setup") {
    const snapshotOptions = moduleKey === "robustness" ? SNAPSHOT_OPTIONS.slice(0, 3) : SNAPSHOT_OPTIONS;
    if (isFixedM1) {
      const studyLabel = isM1Main ? "M1 · 主实验" : "M1 · 初批实验";
      const studyEyebrow = isM1Main ? "M1 MAIN STUDY · PARTICIPANT ENTRY" : "M1 PILOT · PARTICIPANT ENTRY";
      return (
        <main className="mod-site mod-pilot-entry">
          <header className="mod-topbar">
            <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>04</b></span>
            <span className="mod-pilot-header-label">{studyLabel}</span>
          </header>
          <section className="mod-pilot-shell">
            <div className="mod-pilot-hero">
              <span className="mod-eyebrow">{studyEyebrow}</span>
              <h1>观察曲线，<br />标出你眼中的阶段。</h1>
              <p>你将对六条时间序列进行判断。系统会先显示匿名曲线，再逐步加入信息；每一步都请根据当前画面重新确认两个分界点。</p>
            </div>
            <div className="mod-pilot-protocol" aria-label="本次实验流程摘要">
              <article><span>01</span><strong>固定三阶段</strong><p>每次用两个分界点，把曲线划分为三个阶段。</p></article>
              <article><span>02</span><strong>六条曲线，分别作答</strong><p>每个信息层包含六个连续页面，每页只判断一种资产。</p></article>
              <article><span>03</span><strong>逐页独立提交</strong><p>每条曲线完成后立即安全写入数据库；提交后不能返回修改。</p></article>
            </div>
            <section className="mod-pilot-participant-card">
              <div>
                <span className="mod-eyebrow">BEFORE YOU BEGIN</span>
                <h2>输入匿名编号</h2>
                <p>请使用研究者提供的编号，不要填写真实姓名。下一页会说明完整操作方式并征求匿名记录同意。</p>
              </div>
              <div className="mod-pilot-fields">
                <label><span>匿名参与者编号</span><input value={participantCode} maxLength={64} onChange={(event) => setParticipantCode(event.target.value)} placeholder="例如 P-001" autoComplete="off" /></label>
                <label><span>相关经验</span><select value={expertise} onChange={(event) => setExpertise(event.target.value)}><option value="none">无相关经验</option><option value="casual">偶尔关注</option><option value="active">持续参与</option><option value="professional">专业研究/从业</option></select></label>
              </div>
              {(loadError || error) && <p className="mod-error" role="alert">{loadError || error}</p>}
              <button className="mod-start" type="button" onClick={begin} disabled={!bundle || busy || Boolean(loadError)}>{busy ? "正在生成随机实验序列…" : "进入实验说明"}<span>→</span></button>
            </section>
            <p className="mod-pilot-privacy">不采集真实姓名或精确位置 · 会记录设备类别、显示尺寸与匿名交互时间</p>
          </section>
        </main>
      );
    }
    return (
      <main className="mod-site">
        <header className="mod-topbar">
          <Link href="/" className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></Link>
          <nav aria-label="版本入口">
            <a href="#modules">实验模块</a>
            <a href="#configure">配置研究</a>
            {isV4 && <Link href="/v4-predecessor">上一模块版</Link>}
            <Link href="/v3-revised">保留的 V3 修订版</Link>
          </nav>
        </header>

        {isV4 && (
          <div className="mod-operator-strip" role="note">
            <span>RESEARCHER CONSOLE</span>
            <strong>研究者操作台 · 不向被测试者展示</strong>
            <p>在这里锁定实验条件；点击生成说明页后，再将设备交给参与者。</p>
            <div className="mod-operator-actions">
              <Link href="/m1">人类 M1 主实验 ↗</Link>
              <Link href="/agent">Agent 全模块实验 ↗</Link>
              <Link href="/research/results">结果导出 ↗</Link>
              <Link href="/methodology/cues">标签与文献依据 ↗</Link>
            </div>
          </div>
        )}

        <section className="mod-hero">
          <div className="mod-hero-copy">
            <span className="mod-eyebrow">FOURTH EDITION · MODULAR EXPERIMENT PLATFORM · 2026</span>
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

              {isV4 && robustnessFactor === "window" && moduleKey === "robustness" ? (
                <div className="mod-protocol-note">
                  <span>WHOLE ↔ CUT</span>
                  <div><strong>数据窗口由 M4 自动配对</strong><p>同一价格序列分别显示全部可用观测与 2020-01-01—2024-12-31 预设窗口；不插值、不补齐。</p></div>
                </div>
              ) : isV4 ? (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>03</span><div><strong>数据截断</strong><small>把观察窗口作为会话级实验条件；所有试次使用同一规则</small></div></div>
                  <SetupChoice
                    label="数据截断"
                    value={windowMode}
                    onChange={setWindowMode}
                    options={[
                      { value: "whole", title: "完整可用数据", description: "显示每条序列在当前数据源中的全部真实观测；不同资产与指标的起始日可以不同。" },
                      { value: "truncated", title: "预设截断窗口", description: "统一筛选 2020-01-01—2024-12-31；不插值、不按点数比例裁切。" },
                    ]}
                  />
                </div>
              ) : null}

              {moduleKey === "disclosure" && (
                <div className="mod-fieldset">
                  <div className="mod-field-label"><span>03</span><div><strong>披露路径</strong><small>同一曲线内逐层累积，不提前显示后续内容</small></div></div>
                  <SetupChoice
                    label="披露路径"
                    value={disclosurePath}
                    onChange={setDisclosurePath}
                    options={[
                      { value: "general", title: "一般信息 GI · 2 步", description: "序列类型 → 时间与单位；另含 1 次 G0 匿名基线" },
                      { value: "domain", title: "领域信息 DI · 4 步", description: "币名 → 背景 → 核心事件 → 补充事件；另含 G0 基线" },
                      { value: "combined", title: "组合路径 · 6 步", description: "先完成 2 步一般信息，再累积 4 步领域信息；另含 G0 基线" },
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
                <div><dt>预计试次</dt><dd>{moduleKey === "disclosure" ? `${eligibleAssets(bundle ?? { assets: [], controls: [], protocolVersion: "", requestedWindow: { start: "", end: "" } }, metric, resolution).length} 条曲线 × ${DISCLOSURE_PATHS[disclosurePath].length - 1} 步披露 + G0 基线` : moduleKey === "framing" || moduleKey === "cross-series" ? "3 条曲线" : robustnessFactor === "scale" || robustnessFactor === "window" ? "2 条曲线" : "4 条曲线"}</dd></div>
                <div><dt>数据窗口</dt><dd>{isV4 ? moduleKey === "robustness" && robustnessFactor === "window" ? "完整 vs 2020—2024" : windowMode === "truncated" ? "2020—2024（固定）" : "各序列全部可用观测" : "2018—2026"}</dd></div>
                <div><dt>提交规则</dt><dd>每个判断单独写入数据库</dd></div>
              </dl>
              <p>系统会把随机顺序、信息状态、实际显示窗口、分界点、不确定范围、设备环境和逐题交互时间写入会话表与响应表。</p>
            </aside>
          </div>

          <section className="mod-participant-card">
            <div className="mod-field-label"><span>03</span><div><strong>{isV4 ? "会话与样本标记" : "参与者与知情同意"}</strong><small>{isV4 ? "由研究者预先配置；知情说明与同意将在下一页完成" : "用于区分人类与 Agent 样本；不采集真实姓名"}</small></div></div>
            <div className="mod-participant-grid">
              <label><span>判断主体</span><select value={actorType} onChange={(event) => setActorType(event.target.value as "human" | "agent")}><option value="human">人类测试者</option><option value="agent">LLM / Agent</option></select></label>
              <label><span>匿名编号（可选）</span><input value={participantCode} maxLength={64} onChange={(event) => setParticipantCode(event.target.value)} placeholder="例如 P-001" /></label>
              {actorType === "human" ? (
                <label><span>相关经验</span><select value={expertise} onChange={(event) => setExpertise(event.target.value)}><option value="none">无相关经验</option><option value="casual">偶尔关注</option><option value="active">持续参与</option><option value="professional">专业研究/从业</option></select></label>
              ) : (
                <label><span>模型/Agent 名称</span><input value={modelName} maxLength={120} onChange={(event) => setModelName(event.target.value)} placeholder="例如 GPT-5.6" /></label>
              )}
            </div>
            {isV4 ? (
              <div className="mod-console-handoff"><span>交接提示</span><p>下一页是参与者看到的第一屏。它会按本次配置说明任务流程，但不会提前揭示资产、指标、日期、数值、事件或其他后续实验信息。</p></div>
            ) : (
              <label className="mod-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>我已了解：每次提交后不能返回修改；研究会记录判断结果与交互时间，但不要求提供真实身份。</span></label>
            )}
            {(loadError || error) && <p className="mod-error" role="alert">{loadError || error}</p>}
            <button className="mod-start" type="button" onClick={begin} disabled={!bundle || (!isV4 && !consent) || busy || Boolean(loadError)}>{busy ? "正在建立随机实验序列…" : isV4 ? "确认配置，生成参与者说明" : `开始 ${moduleInfo.number} 实验`}<span>→</span></button>
          </section>
        </section>

        <footer className="mod-footer"><span>BOUNDARY LAB · {isV4 ? "FOURTH EDITION" : "MODULAR PROTOCOL V6"}</span><span>{isV4 ? "上一模块版与 V3 修订版均已保留" : "V3 修订版已保留，可随时回退"}</span></footer>
      </main>
    );
  }

  if (phase === "briefing" && isV4 && plan.length) {
    const disclosureUpdates = moduleKey === "disclosure" ? Math.max(0, DISCLOSURE_PATHS[disclosurePath].length - 1) : 0;
    const briefingTask = moduleKey === "framing"
      ? {
          title: "本次会依次出现三种阶段判断任务",
          description: "每一轮开始时，系统都会明确说明可以设置多少个分界点，以及是否使用统一的阶段定义。请只按当轮说明作答。",
        }
      : TASKS[taskType];
    const moduleBriefing: Record<ModuleKey, string> = {
      disclosure: "本次研究关注：你如何在不同可见信息状态下判断同一条曲线的阶段边界。",
      framing: "本次研究关注：不同任务表述是否会改变你对阶段结构的判断。",
      "cross-series": "本次研究关注：同一研究对象的不同时间序列是否呈现相似的阶段结构。",
      robustness: "本次研究关注：图表呈现方式或对照序列是否会改变阶段判断。",
    };
    return (
      <main className="mod-site mod-briefing-page">
        <header className="mod-topbar">
          <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span>
          <span className="mod-briefing-header-label">参与者说明</span>
        </header>

        <section className="mod-briefing-shell">
          <div className="mod-briefing-intro">
            <span className="mod-eyebrow">PARTICIPANT BRIEFING · 正式实验尚未开始</span>
            <h1>在开始之前，<br />先了解你要做什么。</h1>
            <p>你将查看若干时间序列，并按当前可见信息判断曲线的阶段结构。阶段边界没有唯一标准答案，请报告你此刻真正认为最合理的位置。</p>
          </div>

          <div className="mod-briefing-grid">
            <article className="mod-briefing-card is-accent">
              <span>01 · 研究情境</span>
              <h2>{moduleBriefing[moduleKey]}</h2>
              <p>系统只会在预定时点显示信息。请不要猜测尚未出现的内容，也不要使用页面以外的搜索或资料。</p>
            </article>
            <article className="mod-briefing-card">
              <span>02 · 判断任务</span>
              <h2>{briefingTask.title}</h2>
              <p>{briefingTask.description}</p>
              {moduleKey !== "framing" && taskType === "T3" && <blockquote>{STAGE_DEFINITION}</blockquote>}
            </article>
            <article className="mod-briefing-card">
              <span>03 · 本次流程</span>
              <h2>{plan.length} 条实验曲线</h2>
              {moduleKey === "disclosure" ? (
                <p>实验按信息层推进：每一层包含 <strong>{plan.length} 个连续的单曲线页面</strong>；依次提交全部曲线后才进入下一层。共包含 1 层匿名基线与 {disclosureUpdates} 层信息更新。</p>
              ) : (
                <p>每条曲线只使用一个固定的信息状态，不会在同一轮中逐层追加内容。</p>
              )}
            </article>
            <article className="mod-briefing-card">
              <span>04 · 如何作答</span>
              <h2>分界点 + 连续范围</h2>
              <p>先放置分界点，再拖动范围旋钮，给出“最佳位置”可能落入的连续范围。除新增信息影响评分外，不再询问额外的判断理由。</p>
            </article>
            <article className="mod-briefing-card">
              <span>05 · 信息隔离</span>
              <h2>后续信息不会提前出现</h2>
              <p>本页不会说明后续尚未呈现的信息类别或具体内容；相关信息只会在预定步骤显示。</p>
            </article>
            <article className="mod-briefing-card">
              <span>06 · 记录方式</span>
              <h2>提交后锁定，不采集真实姓名</h2>
              <p>研究会记录分界位置、不确定范围、新增信息影响评分、每页作答时间，以及设备类别、屏幕/浏览器视口尺寸、平台、语言和时区等技术环境；不读取联系人、硬件序列号或精确位置。</p>
            </article>
          </div>

          <section className="mod-briefing-consent">
            <div>
              <span className="mod-eyebrow">READY CHECK</span>
              <h2>{actorType === "agent" ? "请确认执行主体已读取实验说明" : "如果说明已经清楚，就可以开始"}</h2>
            </div>
            <label className="mod-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>{actorType === "agent" ? "执行主体已读取以上约束，并会只使用当前页面可见的信息作答。" : "我已阅读并理解以上说明，同意匿名记录本次判断结果、逐页响应时间与设备技术环境。"}</span>
            </label>
            {error && <p className="mod-error" role="alert">{error}</p>}
            <button className="mod-start" type="button" onClick={startParticipantSession} disabled={!consent || busy}>
              {busy ? "正在准备正式实验…" : "我已了解，开始正式实验"}<span>→</span>
            </button>
          </section>
        </section>
      </main>
    );
  }

  if (!bundle || !currentTrial || !currentDisclosure || !currentMetric || !points.length) {
    return <main className="mod-site mod-centered"><p>实验条件无法载入。请刷新页面后重试。</p></main>;
  }

  if (phase === "transition" && usesLayerMajorDisclosureFlow) {
    const previousDisclosure = disclosureIndex > 0 ? currentTrial.disclosures[disclosureIndex - 1] : null;
    return (
      <main className="mod-site mod-layer-transition-page">
        <header className="mod-topbar">
          <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span>
          <span className="mod-transition-header-label">信息层切换 · {disclosureIndex + 1}/{currentTrial.disclosures.length}</span>
        </header>
        <DisclosureRail keys={currentTrial.disclosures} activeIndex={disclosureIndex} />
        <section className="mod-transition-shell">
          <div className="mod-transition-level">
            <span>DISCLOSURE LEVEL</span>
            <strong>{String(disclosureIndex + 1).padStart(2, "0")}</strong>
            <small>/ {String(currentTrial.disclosures.length).padStart(2, "0")}</small>
          </div>
          <div className="mod-transition-copy">
            <span className="mod-transition-new-label">NEW INFORMATION · 新信息已解锁</span>
            <h1>{DISCLOSURE_COPY[currentDisclosure].title}</h1>
            <p>{DISCLOSURE_COPY[currentDisclosure].description}</p>
            <div className="mod-transition-shift" aria-label="信息状态变化">
              <span>{previousDisclosure ? DISCLOSURE_COPY[previousDisclosure].title : "实验说明"}</span>
              <i>→</i>
              <strong>{DISCLOSURE_COPY[currentDisclosure].title}</strong>
            </div>
            <div className="mod-transition-assets" aria-label={`本层包含的 ${plan.length} 条曲线`}>
              {plan.map((trial) => {
                const asset = bundle.assets.find((candidate) => candidate.id === trial.assetId);
                return <span key={trial.id}>{visibility.asset ? asset?.symbol ?? `曲线 ${trial.order + 1}` : `匿名曲线 ${trial.order + 1}`}</span>;
              })}
            </div>
            <div className="mod-transition-notice">
              <b>本层包含 {plan.length} 个连续页面</b>
              <p>每页只显示一条曲线；虚线会保留该资产上一层的位置，作为当前判断的参照。</p>
            </div>
            <button className="mod-start mod-transition-start" type="button" onClick={enterCurrentDisclosureLayer}>我已了解，进入本层第 1 条曲线<span>→</span></button>
          </div>
        </section>
      </main>
    );
  }

  const trialAnswers = answers.filter((answer) => answer.trialId === currentTrial.id);
  const layerAnswers = answers
    .filter((answer) => answer.disclosureIndex === disclosureIndex)
    .sort((first, second) => first.trialOrder - second.trialOrder);
  const reviewAnswers = usesLayerMajorDisclosureFlow ? layerAnswers : trialAnswers;
  const currentModule = MODULES.find((item) => item.key === currentTrial.module) ?? MODULES[0];
  if (phase === "review" && isFixedM1) {
    const hasNextDisclosure = disclosureIndex < currentTrial.disclosures.length - 1;
    const completedLayers = disclosureIndex + 1;
    const overallProgress = completedLayers / currentTrial.disclosures.length * 100;
    return (
      <main className="mod-site mod-review-page mod-neutral-rest-page">
        <header className="mod-topbar"><span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span><span>进度 {completedLayers}/{currentTrial.disclosures.length}</span></header>
        <section className="mod-review-hero">
          <span className="mod-eyebrow">RESPONSES SAVED · 中性休息页</span>
          <h1>本轮 {plan.length} 条回答，<br />已经安全保存。</h1>
          <p>这里不显示答案分析、边界移动或表现反馈。你可以短暂休息，准备好后再继续。</p>
        </section>
        <section className="mod-neutral-rest-card" aria-label="实验总体进度">
          <div><span>已完成判断</span><strong>{reviewAnswers.length}/{plan.length}</strong></div>
          <div><span>总体轮次</span><strong>{completedLayers}/{currentTrial.disclosures.length}</strong></div>
          <div className="mod-neutral-progress"><i><b style={{ width: `${overallProgress}%` }} /></i><small>{Math.round(overallProgress)}%</small></div>
          <p>请放松视线和手部；继续后仍按当前页面可见信息独立判断。</p>
        </section>
        {error && <p className="mod-error mod-review-error" role="alert">{error}</p>}
        <button className="mod-start mod-review-next" type="button" onClick={continueAfterReview} disabled={busy}>{hasNextDisclosure ? "继续下一轮判断" : "保存并完成本次实验"}<span>→</span></button>
      </main>
    );
  }
  const movementAnswers = usesLayerMajorDisclosureFlow ? reviewAnswers : trialAnswers.slice(1);
  const movement = movementAnswers.length
    ? movementAnswers.reduce((sum, answer) => {
        const matched = Math.min(answer.boundaries.length, answer.previousBoundaries.length);
        return sum + answer.boundaries.slice(0, matched).reduce((inner, boundary, index) => inner + Math.abs(boundary.ratio - answer.previousBoundaries[index].ratio), 0);
      }, 0)
    : 0;
  const averageRange = reviewAnswers.length
    ? reviewAnswers.reduce((sum, answer) => sum + answer.boundaryIntervals.reduce((inner, interval) => inner + interval.widthRatio, 0), 0) /
      Math.max(1, reviewAnswers.reduce((sum, answer) => sum + answer.boundaryIntervals.length, 0))
    : 0;
  const changedCurveCount = reviewAnswers.filter((answer) => {
    if (!answer.previousBoundaries.length) return false;
    const previousIntervals = answer.boundaryIntervals.map((interval) => interval.halfWidthRatio);
    const priorIntervals = answers
      .filter((candidate) => candidate.trialId === answer.trialId && candidate.disclosureIndex < answer.disclosureIndex)
      .sort((first, second) => second.disclosureIndex - first.disclosureIndex)[0]
      ?.boundaryIntervals.map((interval) => interval.halfWidthRatio) ?? [];
    return !sameNumbers(answer.boundaries.map((boundary) => boundary.ratio), answer.previousBoundaries.map((boundary) => boundary.ratio)) ||
      !sameNumbers(previousIntervals, priorIntervals);
  }).length;

  if (phase === "review") {
    const first = trialAnswers[0];
    const last = trialAnswers[trialAnswers.length - 1];
    const hasNextDisclosure = disclosureIndex < currentTrial.disclosures.length - 1;
    return (
      <main className="mod-site mod-review-page">
        <header className="mod-topbar"><span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span><span>{usesLayerMajorDisclosureFlow ? `披露层 ${disclosureIndex + 1}/${currentTrial.disclosures.length}` : `${currentModule.number} · 试次 ${trialIndex + 1}/${plan.length}`}</span></header>
        <section className="mod-review-hero">
          <span className="mod-eyebrow">MICRO REWARD · {usesLayerMajorDisclosureFlow ? "本层反馈" : "本轮反馈"}</span>
          <h1>{usesLayerMajorDisclosureFlow ? <>这一信息层的 {plan.length} 条曲线，<br />已经全部完成。</> : <>你刚刚留下了一条<br />可测量的判断轨迹。</>}</h1>
          <p>这不是标准答案评分；它只把{usesLayerMajorDisclosureFlow ? `${plan.length} 条曲线在当前信息层的边界、不确定范围与修正情况` : "你在本轮中的阶段结构、上下文修正和不确定性"}可视化。</p>
        </section>
        <section className="mod-review-grid">
          <article className="mod-review-chart">
            <div className="mod-review-title"><span>{usesLayerMajorDisclosureFlow ? `本层 ${plan.length} 条曲线` : "边界轨迹"}</span><strong>{reviewAnswers.length} 次判断</strong></div>
            <div className="mod-track">
              {reviewAnswers.map((answer) => {
                const answerTrial = plan.find((trial) => trial.id === answer.trialId);
                const answerAsset = bundle.assets.find((asset) => asset.id === answer.assetId);
                const rowLabel = usesLayerMajorDisclosureFlow
                  ? visibility.asset
                    ? answerAsset?.symbol ?? `曲线 ${answer.trialOrder + 1}`
                    : `曲线 ${answer.trialOrder + 1}`
                  : DISCLOSURE_COPY[answer.disclosureKey].short;
                return (
                <div className="mod-track-row" key={`${answer.trialId}-${answer.disclosureIndex}`}>
                  <span title={answerTrial?.variantLabel}>{rowLabel}</span>
                  <div>{answer.boundaries.map((boundary, boundaryIndex) => <i key={boundaryIndex} style={{ left: `${boundary.ratio * 100}%` }}><b>{boundaryIndex + 1}</b></i>)}</div>
                </div>
                );
              })}
            </div>
          </article>
          <article className="mod-review-stat is-dark"><small>{usesLayerMajorDisclosureFlow ? "本层边界位移" : "累计边界位移"}</small><strong>{(movement * 100).toFixed(1)}<em>% 时间窗</em></strong><p>{disclosureIndex > 0 || (!usesLayerMajorDisclosureFlow && trialAnswers.length > 1) ? "反映相对上一信息状态的边界修正总量" : "匿名基线层用于建立初始判断，不计算层间位移"}</p></article>
          <article className="mod-review-stat"><small>平均不确定范围</small><strong>{(averageRange * 100).toFixed(1)}<em>% 时间窗</em></strong><p>范围越宽，表示你对精确边界位置保留越多余量</p></article>
          {usesLayerMajorDisclosureFlow ? (
            <article className="mod-review-stat"><small>{disclosureIndex > 0 ? "发生修正的曲线" : "本层完成"}</small><strong>{disclosureIndex > 0 ? `${changedCurveCount}/${reviewAnswers.length}` : `${reviewAnswers.length}/${plan.length}`}<em>{disclosureIndex > 0 ? " 条曲线" : " 已提交"}</em></strong><p>{disclosureIndex > 0 ? "边界位置或不确定范围相对上一层发生改变" : `${plan.length} 条匿名基线均已独立写入`}</p></article>
          ) : (
            <article className="mod-review-stat"><small>阶段数量</small><strong>{(last?.boundaries.length ?? first?.boundaries.length ?? 0) + 1}<em> 个阶段</em></strong><p>{first && last && first.boundaries.length !== last.boundaries.length ? `从 ${first.boundaries.length + 1} 个阶段修正为 ${last.boundaries.length + 1} 个阶段` : "本轮阶段数量保持稳定"}</p></article>
          )}
        </section>
        {error && <p className="mod-error mod-review-error" role="alert">{error}</p>}
        <button className="mod-start mod-review-next" type="button" onClick={continueAfterReview} disabled={busy}>{usesLayerMajorDisclosureFlow ? hasNextDisclosure ? "进入下一信息层" : "完成本次模块" : trialIndex < plan.length - 1 ? "进入下一条曲线" : "完成本次模块"}<span>→</span></button>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <main className="mod-site mod-complete-page">
        <section>
          <span className="mod-eyebrow">SESSION COMPLETE</span>
          <h1>{isM1Main ? "M1 主实验已完成。" : isPilot ? "M1 初批实验已完成。" : `${currentModule.number} 模块已完成。`}</h1>
          <p>共记录 {answers.length} 次判断，覆盖 {plan.length} 条实验曲线。浏览器中的副本可以下载；服务器端已保存逐题答案、设备环境与响应时间。</p>
          <div className="mod-session-code"><span>SESSION ID</span><code>{sessionId}</code></div>
          <div className="mod-complete-actions">
            <button type="button" onClick={() => downloadSessionCsv(
              sessionId,
              answers,
              sessionDeviceInfo.current,
              isFixedM1 ? sessionProtocolVersion : bundle.protocolVersion,
              bundle.protocolVersion,
              baselinePlacementProtocol,
            )}>下载本次 CSV</button>
            <button type="button" onClick={() => downloadJson(`boundary-lab-${sessionId}.json`, {
              sessionProtocolVersion: isFixedM1 ? sessionProtocolVersion : bundle.protocolVersion,
              responseVersion: activeResponseVersion,
              stimulusProtocolVersion: bundle.protocolVersion,
              baselinePlacementProtocol,
              sessionId,
              module: currentModule,
              deviceInfo: sessionDeviceInfo.current,
              plan,
              answers,
            })}>下载本次 JSON</button>
            <button type="button" onClick={() => window.location.reload()}>{isM1Main ? "返回 M1 主实验入口" : isPilot ? "返回初批入口" : "返回模块首页"}</button>
          </div>
        </section>
      </main>
    );
  }

  if (phase === "experiment" && usesLayerMajorDisclosureFlow && !usesFixedM1SequentialPages) {
    const completedDraftCount = plan.filter((trial) => {
      const previous = priorAnswerForPosition(trial, disclosureIndex, answers);
      return validateLayerAssetDraft(trial, layerDrafts[trial.id], previous, disclosureIndex) === "";
    }).length;
    const totalLayerCount = currentTrial.disclosures.length;
    const layerProgress = totalLayerCount ? disclosureIndex / totalLayerCount * 100 : 0;
    return (
      <main className="mod-site mod-runner mod-layer-page">
        <header className="mod-topbar">
          <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span>
          <div className="mod-run-progress"><span>M1 · 信息披露主实验</span><strong>披露层 {disclosureIndex + 1}/{totalLayerCount} · {plan.length} 条同页</strong><i><b style={{ width: `${layerProgress}%` }} /></i></div>
          <span className="mod-session-mini">ID {sessionId.slice(0, 8)}</span>
        </header>

        <DisclosureRail keys={currentTrial.disclosures} activeIndex={disclosureIndex} />

        <section className="mod-layer-exposure-banner" aria-live="polite">
          <div className="mod-layer-exposure-index"><span>NEW</span><strong>{String(disclosureIndex + 1).padStart(2, "0")}</strong></div>
          <div>
            <span>本层新获得的信息 · INFORMATION UPDATE</span>
            <h1>{DISCLOSURE_COPY[currentDisclosure].title}</h1>
            <p>{DISCLOSURE_COPY[currentDisclosure].description}</p>
          </div>
          <aside><b>{plan.length} 条曲线已统一更新</b><small>请完成本页全部判断，再整层提交</small></aside>
        </section>

        <section className="mod-layer-task-strip">
          <div><span className="mod-kicker">当前任务 · {currentTrial.taskType}</span><strong>{TASKS[currentTrial.taskType].title}</strong><p>{TASKS[currentTrial.taskType].description}</p></div>
          <div><span>本页完成度</span><strong>{completedDraftCount}/{plan.length}</strong><small>达到 6/6 后即可提交本层</small></div>
        </section>

        <section className="mod-six-asset-grid" aria-label={`本层 ${plan.length} 条曲线的判断区域`}>
          {plan.map((trial) => (
            <LayerAssetResponseCard
              key={`${trial.id}-${disclosureIndex}`}
              bundle={bundle}
              trial={trial}
              disclosureKey={currentDisclosure}
              disclosureIndex={disclosureIndex}
              disclosurePath={disclosurePath}
              draft={layerDrafts[trial.id] ?? makeLayerAssetDraft(trial, priorAnswerForPosition(trial, disclosureIndex, answers))}
              previousAnswer={priorAnswerForPosition(trial, disclosureIndex, answers)}
              validationError={layerValidationErrors[trial.id]}
              onChange={(updater) => {
                setLayerDrafts((current) => {
                  const activeDraft = current[trial.id] ?? makeLayerAssetDraft(trial, priorAnswerForPosition(trial, disclosureIndex, answers));
                  return { ...current, [trial.id]: updater(activeDraft) };
                });
                setLayerValidationErrors((current) => {
                  if (!current[trial.id]) return current;
                  const next = { ...current };
                  delete next[trial.id];
                  return next;
                });
                if (!busy) setError("");
              }}
            />
          ))}
        </section>

        <section className="mod-layer-submit-bar">
          <div>
            <span>{busy ? "正在写入数据库" : "本层统一提交"}</span>
            <strong>{busy ? `${batchProgress.completed}/${batchProgress.total} 条已安全记录` : `${completedDraftCount}/${plan.length} 条已完成`}</strong>
            <small>数据库仍按“币种 × 信息层”保存独立记录，CSV 字段保持不变。</small>
          </div>
          {error && <p className="mod-error" role="alert">{error}</p>}
          <button type="button" onClick={submitDisclosureLayer} disabled={busy}>{busy ? `正在安全记录 ${batchProgress.completed}/${batchProgress.total}…` : `提交本层 ${plan.length} 条判断，查看反馈`}<span>→</span></button>
        </section>
      </main>
    );
  }

  const sameAsPrevious = previousAnswer
    ? sameNumbers(boundaries, previousRatios) &&
      widths.length === previousAnswer.boundaryIntervals.length &&
      widths.every((value, index) => value === previousAnswer.boundaryIntervals[index]?.halfWidthRatio)
    : false;
  const responseShapeReady = currentTrial.taskType === "T1"
    ? (boundaries.length === 0 ? singleStageConfirmed : widths.length === boundaries.length && widths.every((value) => value !== null))
    : boundaries.length === 2 && widths.length === 2 && widths.every((value) => value !== null);
  const runnerVariantLabel = isV4
    ? participantVariantLabel(currentTrial, visibility)
    : currentTrial.variantLabel;
  const totalJudgments = plan.reduce((sum, trial) => sum + trial.disclosures.length, 0);
  const completedJudgments = usesLayerMajorDisclosureFlow
    ? disclosureIndex * plan.length + trialIndex
    : plan.slice(0, trialIndex).reduce((sum, trial) => sum + trial.disclosures.length, 0) + disclosureIndex;
  const runProgress = totalJudgments ? completedJudgments / totalJudgments * 100 : 0;

  return (
    <main className="mod-site mod-runner">
      <header className="mod-topbar">
        <span className="mod-wordmark"><span>BOUNDARY</span> LAB <b>{editionMark}</b></span>
        <div className="mod-run-progress"><span>{currentModule.number} · {currentModule.title}</span><strong>{usesLayerMajorDisclosureFlow ? `披露层 ${disclosureIndex + 1}/${currentTrial.disclosures.length} · 本层曲线 ${trialIndex + 1}/${plan.length}` : `曲线 ${trialIndex + 1}/${plan.length}`}</strong><i><b style={{ width: `${runProgress}%` }} /></i></div>
        <span className="mod-session-mini">ID {sessionId.slice(0, 8)}</span>
      </header>

      {currentTrial.module === "disclosure" ? <DisclosureRail keys={currentTrial.disclosures} activeIndex={disclosureIndex} /> : <DisclosureSnapshot active={currentDisclosure} />}

      {usesFixedM1SequentialPages && (
        <section className="mod-layer-exposure-banner is-sequential" aria-live="polite">
          <div className="mod-layer-exposure-index"><span>LEVEL</span><strong>{String(disclosureIndex + 1).padStart(2, "0")}</strong></div>
          <div>
            <span>当前信息层 · INFORMATION STATE</span>
            <h1>{DISCLOSURE_COPY[currentDisclosure].title}</h1>
            <p>{DISCLOSURE_COPY[currentDisclosure].description}</p>
          </div>
          <aside><b>本层页面 {trialIndex + 1}/{plan.length}</b><small>本页只判断一条曲线，提交后进入下一条</small></aside>
        </section>
      )}

      {usesLayerMajorDisclosureFlow && (
        <section className="mod-layer-asset-progress" aria-label="当前披露层的曲线进度">
          <div><span>本信息层</span><strong>{DISCLOSURE_COPY[currentDisclosure].title}</strong><small>{plan.length} 条曲线使用完全相同的信息状态</small></div>
          <ol>
            {plan.map((trial, index) => {
              const asset = bundle.assets.find((candidate) => candidate.id === trial.assetId);
              return (
                <li className={index < trialIndex ? "is-complete" : index === trialIndex ? "is-current" : ""} key={trial.id}>
                  <i>{index < trialIndex ? "✓" : index + 1}</i>
                  <span>{visibility.asset ? asset?.symbol ?? `曲线 ${index + 1}` : `曲线 ${index + 1}`}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="mod-run-layout">
        <div className="mod-run-main">
          <div className="mod-stimulus-heading">
            <div>
              <span className="mod-eyebrow">{runnerVariantLabel} · {TASKS[currentTrial.taskType].short}</span>
              <h1>{visibility.asset ? `${displayName}（${displaySymbol}）` : visibility.metric ? currentMetric.name : "一段未命名的走势"}</h1>
              <p>{visibility.intro
                ? displayIntro
                : visibility.metric
                  ? metricDescriptionForDisclosure(currentTrial.metric, visibility.axes, currentMetric.definition, isFixedM1)
                  : "请只根据当前可见的信息判断阶段结构。"}</p>
            </div>
            <div className="mod-condition-chips">
              <span>{visibility.metric ? currentMetric.name : "指标：？"}</span>
              <span>{visibility.axes ? `${RESOLUTION_LABEL[currentTrial.resolution]} · ${currentTrial.scaleMode === "log" ? "对数" : "线性"}` : "坐标：？"}</span>
              <span>{visibility.asset ? displaySymbol : "资产：？"}</span>
            </div>
          </div>

          {currentTrial.taskType === "T3" && <div className="mod-definition"><span>统一阶段定义</span><p>{STAGE_DEFINITION}</p></div>}

          <ModularChart
            key={`${currentTrial.id}-${disclosureIndex}`}
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

          {(currentDisclosure === "DI3" || currentDisclosure === "DI4" || newlyDisclosedEvents.length > 0) && (
            <section className="mod-event-panel">
              <div className="mod-event-panel-head"><span className="mod-kicker">本层新增 · {currentDisclosure === "DI3" ? "事件信息（一）" : currentDisclosure === "DI4" ? "事件信息（二）" : "历史事件"}</span><strong>{newlyDisclosedEvents.length} 项 · 上限 {MAX_EVENTS_PER_DISCLOSURE}</strong></div>
              {retainedEventCount > 0 && <p className="mod-event-retained">上一层的 {retainedEventCount} 个事件标记继续保留在曲线上；下方只列出本层新增内容。</p>}
              {newlyDisclosedEvents.length ? (
                <div className="mod-event-list">
                  {newlyDisclosedEvents.map((event) => (
                    <article key={event.sourceId ?? `${event.date}-${event.title}`}><time>{event.date}</time><h3>{event.title}</h3><p>{event.description}</p></article>
                  ))}
                </div>
              ) : <p className="mod-event-empty">当前显示时间窗内没有可展示的新增事件。</p>}
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
            showDates={visibility.axes}
          />

          {!isV4 && (
            <section className="mod-question-block">
              <h3>你对这次划分有多大信心？</h3>
              <Rating value={confidence} onChange={(value) => { setConfidence(value); setConfidenceTouched(true); }} left="很不确定" right="非常确定" label="判断信心" />
            </section>
          )}

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

          {!isFixedM1 && ((!isV4 || responseShapeReady) ? (
            <section className="mod-question-block">
              <h3>{isV4 ? activeCueSet.question : "这次判断主要参考了什么？"}<small>可多选</small></h3>
              {isV4 ? (
                <div className="mod-cue-groups">
                  <div className="mod-cue-group">
                    <span>{activeCueSet.eyebrow}</span>
                    <div className="mod-cue-list">
                      {activeCueSet.options.map((cue) => (
                        <button
                          type="button"
                          key={cue.code}
                          className={cueTags.includes(cue.code) ? "is-selected" : ""}
                          aria-pressed={cueTags.includes(cue.code)}
                          onClick={() => toggleCue(cue)}
                        >{cue.label}</button>
                      ))}
                    </div>
                  </div>
                  <p className="mod-cue-note">{activeCueSet.note} 至少选择一项；“没有改变”与其他选项互斥。</p>
                </div>
              ) : (
                <div className="mod-cue-list">{LEGACY_CUES.map((cue) => <button type="button" key={cue} className={cueTags.includes(cue) ? "is-selected" : ""} onClick={() => setCueTags((value) => value.includes(cue) ? value.filter((item) => item !== cue) : [...value, cue])}>{cue}</button>)}</div>
              )}
              <label className="mod-rationale"><span>还想补充什么？<small>可不填</small></span><textarea value={rationale} maxLength={1000} onChange={(event) => setRationale(event.target.value)} placeholder="例如：这里开始由持续上涨转为高位震荡……" /><i>{rationale.length}/1000</i></label>
            </section>
          ) : (
            <section className="mod-question-block mod-cue-awaiting">
              <span className="mod-kicker">完成分界判断后出现</span>
              <h3>判断依据</h3>
              <p>先确定分界点及其大致范围，随后再记录你实际使用的线索，避免选项提前影响分界。</p>
            </section>
          ))}

          {error && <p className="mod-error" role="alert">{error}</p>}
          <button className="mod-submit" type="button" onClick={() => submitResponse(performance.now())} disabled={busy}>{busy ? "正在安全记录…" : usesLayerMajorDisclosureFlow ? trialIndex < plan.length - 1 ? "提交本曲线，进入本层下一条" : "提交本层最后一条，查看本层反馈" : disclosureIndex < currentTrial.disclosures.length - 1 ? "提交本步，揭示下一项信息" : "提交本轮，查看反馈"}<span>→</span></button>
          <p className="mod-lock-note">提交后不能返回修改本步答案。</p>
        </aside>
      </section>
    </main>
  );
}
