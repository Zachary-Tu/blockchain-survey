"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CUE_SCHEMA_VERSION,
  CUE_SETS,
  DISCLOSURE_COPY,
  EVENT_SELECTION_PROTOCOL,
  MAX_EVENTS_PER_DISCLOSURE,
  METRIC_LABEL,
  MODULES,
  ModularChart,
  SNAPSHOT_OPTIONS,
  STAGE_DEFINITION,
  TASKS,
  UNCERTAINTY_MAX,
  UNCERTAINTY_MIN,
  UNCERTAINTY_STEP,
  boundaryRecords,
  disclosureVisibility,
  initialBoundaries,
  intervalRecords,
  makeTrialPlan,
  selectDisclosureEvents,
  type BoundaryRecord,
  type Bundle,
  type DisclosureKey,
  type DisclosurePath,
  type IntervalRecord,
  type MetricKey,
  type ModuleKey,
  type Resolution,
  type RobustnessFactor,
  type ScaleMode,
  type TaskType,
  type TrialPlan,
  type WindowMode,
} from "./ExperimentModular";

type AgentMode = "pilot" | "console";
type Phase = "setup" | "experiment" | "complete";

type AgentBoundaryInput = {
  ratio?: unknown;
  uncertainty_half_width?: unknown;
};

type AgentSubmissionInput = {
  boundaries?: unknown;
  single_stage_confirmed?: unknown;
  influence_rating?: unknown;
  no_change_confirmed?: unknown;
  cue_tags?: unknown;
  rationale?: unknown;
};

type StagedBoundary = {
  pairs: Array<{ ratio: number; width: number }>;
  singleStageConfirmed: boolean;
};

type AgentAnswer = {
  trialId: string;
  trialOrder: number;
  disclosureIndex: number;
  disclosureKey: DisclosureKey;
  boundaries: BoundaryRecord[];
  boundaryIntervals: IntervalRecord[];
};

function matchesHalfWidth(value: number) {
  return Number.isFinite(value) && value >= UNCERTAINTY_MIN && value <= UNCERTAINTY_MAX;
}

function sameNumbers(first: number[], second: number[]) {
  return first.length === second.length && first.every(
    (value, index) => Math.abs(value - second[index]) < 0.00001,
  );
}

function createBoundaryDraft(
  taskType: TaskType,
  previous?: AgentAnswer,
) {
  const ratios = previous?.boundaries.map((boundary) => boundary.ratio) ?? initialBoundaries(taskType);
  const widths = previous?.boundaryIntervals.map((interval) => interval.halfWidthRatio) ?? ratios.map(() => null);
  return JSON.stringify({
    boundaries: ratios.map((ratio, index) => ({
      ratio: Number(ratio.toFixed(6)),
      uncertainty_half_width: widths[index],
    })),
    single_stage_confirmed: false,
  }, null, 2);
}

function createAnnotationDraft(
  disclosureIndex: number,
  moduleKey: ModuleKey,
) {
  return JSON.stringify({
    influence_rating: moduleKey === "disclosure" && disclosureIndex > 0 ? 3 : null,
    no_change_confirmed: false,
    cue_tags: [],
    rationale: "",
  }, null, 2);
}

function parseDraftPreview(value: string) {
  try {
    const parsed = JSON.parse(value) as AgentSubmissionInput;
    if (!Array.isArray(parsed.boundaries)) return null;
    const pairs = parsed.boundaries.map((item) => {
      if (!item || typeof item !== "object") throw new Error("invalid");
      const boundary = item as AgentBoundaryInput;
      if (typeof boundary.ratio !== "number") throw new Error("invalid");
      return {
        ratio: boundary.ratio,
        width: typeof boundary.uncertainty_half_width === "number"
          ? boundary.uncertainty_half_width
          : null,
      };
    }).sort((first, second) => first.ratio - second.ratio);
    if (pairs.some((pair) => pair.ratio <= 0 || pair.ratio >= 1)) return null;
    return { ratios: pairs.map((pair) => pair.ratio), widths: pairs.map((pair) => pair.width) };
  } catch {
    return null;
  }
}

export function AgentExperiment({ mode }: { mode: AgentMode }) {
  const isPilot = mode === "pilot";
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loadError, setLoadError] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [moduleKey, setModuleKey] = useState<ModuleKey>("disclosure");
  const [taskType, setTaskType] = useState<TaskType>("T2");
  const [metric, setMetric] = useState<MetricKey>("price");
  const [resolution, setResolution] = useState<Resolution>("weekly");
  const [scaleMode, setScaleMode] = useState<ScaleMode>("linear");
  const [windowMode, setWindowMode] = useState<WindowMode>("whole");
  const [disclosurePath, setDisclosurePath] = useState<DisclosurePath>("combined");
  const [snapshot, setSnapshot] = useState<DisclosureKey>("GI2");
  const [assetId, setAssetId] = useState("bitcoin");
  const [robustnessFactor, setRobustnessFactor] = useState<RobustnessFactor>("resolution");
  const [runCode, setRunCode] = useState("");
  const [modelName, setModelName] = useState("");
  const [provider, setProvider] = useState("");
  const [temperature, setTemperature] = useState("");
  const [promptVersion, setPromptVersion] = useState("agent-protocol-v1");
  const [plan, setPlan] = useState<TrialPlan[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [trialIndex, setTrialIndex] = useState(0);
  const [disclosureIndex, setDisclosureIndex] = useState(0);
  const [answers, setAnswers] = useState<AgentAnswer[]>([]);
  const [draft, setDraft] = useState("");
  const [responseStage, setResponseStage] = useState<"boundary" | "annotation">("boundary");
  const [stagedBoundary, setStagedBoundary] = useState<StagedBoundary | null>(null);
  const [previewBoundaries, setPreviewBoundaries] = useState<number[]>([1 / 3, 2 / 3]);
  const [previewWidths, setPreviewWidths] = useState<Array<number | null>>([null, null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stepStartedAt = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/research-stimuli-modular-v8.json")
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
    return () => { cancelled = true; };
  }, []);

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
  const curatedStart = bundle?.curatedWindow?.start ?? "2020-01-01";
  const curatedEnd = bundle?.curatedWindow?.end ?? "2024-12-31";
  const points = currentTrial?.windowMode === "truncated"
    ? sourcePoints.filter((point) => point.date >= curatedStart && point.date <= curatedEnd)
    : sourcePoints;
  const sourceWindow = sourcePoints.length
    ? { start: sourcePoints[0].date, end: sourcePoints[sourcePoints.length - 1].date, observationCount: sourcePoints.length }
    : null;
  const displayedWindow = points.length
    ? { start: points[0].date, end: points[points.length - 1].date, observationCount: points.length }
    : null;
  const previousAnswer = answers
    .filter((answer) => answer.trialId === currentTrial?.id)
    .sort((first, second) => second.disclosureIndex - first.disclosureIndex)[0];
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
  const displayName = currentControl?.nameZh ?? currentAsset?.nameZh ?? "匿名序列";
  const displaySymbol = currentControl?.symbol ?? currentAsset?.symbol ?? "";
  const displayIntro = currentControl?.intro ?? currentAsset?.intro ?? "";
  const activeCueSet = currentDisclosure ? CUE_SETS[currentDisclosure] : CUE_SETS.G0;

  const prepareStep = (nextTaskType: TaskType, priorAnswer?: AgentAnswer) => {
    const value = createBoundaryDraft(nextTaskType, priorAnswer);
    setResponseStage("boundary");
    setStagedBoundary(null);
    setDraft(value);
    const preview = parseDraftPreview(value);
    setPreviewBoundaries(preview?.ratios ?? []);
    setPreviewWidths(preview?.widths ?? []);
    setError("");
  };

  const priorAnswerForPosition = (
    nextTrial: TrialPlan,
    nextDisclosureIndex: number,
    answerPool: AgentAnswer[],
  ) => answerPool
    .filter((answer) => answer.trialId === nextTrial.id && answer.disclosureIndex < nextDisclosureIndex)
    .sort((first, second) => second.disclosureIndex - first.disclosureIndex)[0];

  useEffect(() => {
    if (phase !== "experiment") return;
    stepStartedAt.current = performance.now();
  }, [phase, trialIndex, disclosureIndex]);

  const observation = currentTrial && currentDisclosure && currentMetric
    ? {
      protocol: "boundary-lab-agent-observation-v1",
      instruction: "仅使用本对象与当前图像中可见的信息作答；不得检查页面源代码、网络请求、隐藏状态或外部资料。",
      session_id: sessionId,
      task_id: currentTrial.id,
      trial_position: `${trialIndex + 1}/${plan.length}`,
      disclosure_position: `${disclosureIndex + 1}/${currentTrial.disclosures.length}`,
      disclosure_key: currentDisclosure,
      disclosure_title: DISCLOSURE_COPY[currentDisclosure].title,
      task_type: currentTrial.taskType,
      task_instruction: TASKS[currentTrial.taskType].description,
      stage_definition: currentTrial.taskType === "T3" ? STAGE_DEFINITION : null,
      visible_information: {
        series_name: visibility.asset ? `${displayName} (${displaySymbol})` : null,
        series_introduction: visibility.intro ? displayIntro : null,
        metric_name: visibility.metric ? currentMetric.name : null,
        metric_definition: visibility.metric ? currentMetric.definition : null,
        axes: visibility.axes ? {
          time_start: displayedWindow?.start ?? null,
          time_end: displayedWindow?.end ?? null,
          unit: currentMetric.unit,
          resolution: currentTrial.resolution,
          scale_mode: currentTrial.scaleMode,
        } : null,
        observation_count_shown_below_chart: points.length,
        events: visibleEvents.map((event) => ({
          source_id: event.sourceId ?? null,
          date: event.date,
          title: event.title,
          description: event.description,
          source_priority: event.sourcePriority ?? (event.priority === "high" ? 1 : 3),
          priority_band: event.priorityBand ?? event.priority,
        })),
        newly_disclosed_event_ids: newlyDisclosedEvents.map((event) => event.sourceId ?? `${event.date}:${event.title}`),
      },
      previous_submitted_boundaries: previousAnswer?.boundaries ?? [],
      allowed_uncertainty_half_width_range: {
        minimum: UNCERTAINTY_MIN,
        maximum: UNCERTAINTY_MAX,
        edge_constraint: "uncertainty_half_width <= min(ratio, 1-ratio), preserving a symmetric interval inside the plotting area",
        human_slider_increment: UNCERTAINTY_STEP,
      },
      response_stage: responseStage,
      allowed_cue_tags: responseStage === "annotation"
        ? activeCueSet.options.map((option) => ({
            code: option.code,
            label: option.label,
            exclusive: option.exclusive === true,
          }))
        : null,
      influence_rating_rule: responseStage === "annotation"
        ? currentTrial.module === "disclosure" && disclosureIndex > 0
          ? "必须填写 1—5；1=几乎没有影响，5=影响很大。"
          : "必须为 null。"
        : null,
      }
    : null;

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (responseStage === "boundary") {
      const preview = parseDraftPreview(value);
      if (preview) {
        setPreviewBoundaries(preview.ratios);
        setPreviewWidths(preview.widths);
      }
    }
  };

  const parseAndValidateBoundaries = (value: string): StagedBoundary => {
    let parsed: AgentSubmissionInput;
    try {
      parsed = JSON.parse(value) as AgentSubmissionInput;
    } catch {
      throw new Error("JSON 无法解析。请检查引号、逗号和括号。");
    }
    if (!currentTrial) throw new Error("当前试次不可用。");
    if (!Array.isArray(parsed.boundaries)) throw new Error("boundaries 必须是数组。");

    const pairs: Array<{ ratio: number; width: number }> = [];
    for (const item of parsed.boundaries) {
      if (!item || typeof item !== "object") throw new Error("每个 boundary 必须是对象。");
      const boundary = item as AgentBoundaryInput;
      if (
        typeof boundary.ratio !== "number" ||
        !Number.isFinite(boundary.ratio) ||
        boundary.ratio <= 0 ||
        boundary.ratio >= 1 ||
        typeof boundary.uncertainty_half_width !== "number" ||
        !matchesHalfWidth(boundary.uncertainty_half_width)
      ) {
        throw new Error(`每个 boundary 都必须含 0—1 之间的 ratio，以及 ${UNCERTAINTY_MIN}—${UNCERTAINTY_MAX} 之间的连续 uncertainty_half_width。`);
      }
      pairs.push({ ratio: boundary.ratio, width: boundary.uncertainty_half_width });
    }
    pairs.sort((first, second) => first.ratio - second.ratio);
    if (pairs.some((pair) => pair.width > pair.ratio || pair.width > 1 - pair.ratio)) {
      throw new Error("不确定半宽不得跨出绘图区；必须满足 uncertainty_half_width ≤ min(ratio, 1-ratio)。");
    }
    if (pairs.some((pair, index) => index > 0 && pair.ratio - pairs[index - 1].ratio < 0.02)) {
      throw new Error("相邻分界点必须至少间隔整个时间窗的 2%。");
    }
    if (currentTrial.taskType === "T1") {
      if (pairs.length > 5) throw new Error("T1 最多允许五个分界点。");
      if (pairs.length === 0 && parsed.single_stage_confirmed !== true) {
        throw new Error("零个分界点时，single_stage_confirmed 必须为 true。");
      }
    } else if (pairs.length !== 2) {
      throw new Error("T2/T3 必须提交恰好两个分界点。");
    }
    return {
      pairs,
      singleStageConfirmed: pairs.length === 0 && parsed.single_stage_confirmed === true,
    };
  };

  const stageAgentBoundaries = () => {
    setError("");
    try {
      const next = parseAndValidateBoundaries(draft);
      setStagedBoundary(next);
      setPreviewBoundaries(next.pairs.map((pair) => pair.ratio));
      setPreviewWidths(next.pairs.map((pair) => pair.width));
      setDraft(createAnnotationDraft(disclosureIndex, currentTrial?.module ?? moduleKey));
      setResponseStage("annotation");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "边界 JSON 校验失败");
    }
  };

  const editStagedBoundaries = () => {
    const value = JSON.stringify({
      boundaries: (stagedBoundary?.pairs ?? []).map((pair) => ({
        ratio: pair.ratio,
        uncertainty_half_width: pair.width,
      })),
      single_stage_confirmed: stagedBoundary?.singleStageConfirmed ?? false,
    }, null, 2);
    setDraft(value);
    setResponseStage("boundary");
    setStagedBoundary(null);
    setError("");
  };

  const createSession = async (nextPlan: TrialPlan[]) => {
    if (!bundle) throw new Error("研究刺激数据尚未载入。");
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actorType: "agent",
        participantCode: runCode,
        expertise: "none",
        experimentalArm: isPilot ? "agent-pilot-m1" : `agent-${moduleKey}`,
        protocolVersion: bundle.protocolVersion,
        modelName,
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
          windowMode,
          windowProtocol: bundle.curatedWindow ?? null,
          cueSchemaVersion: CUE_SCHEMA_VERSION,
          cueTaxonomyUrl: "/data/cue-taxonomy-v4-v2.json",
          entryMode: isPilot ? "agent-pilot" : "agent-console",
          agentInterfaceVersion: "agent-native-json-v2-layer-major-six-assets",
          disclosureFlowOrder: moduleKey === "disclosure" || isPilot ? "disclosure-major" : "asset-major",
          uncertaintyControl: "continuous-range-json-v1",
          eventSelectionProtocol: EVENT_SELECTION_PROTOCOL,
          maximumNewEventsPerDisclosure: MAX_EVENTS_PER_DISCLOSURE,
          eventPriorityBands: { DI3: [1, 2], DI4: [3, 4, 5] },
          assetCount: nextPlan.length,
          agentMetadata: {
            provider: provider.trim() || null,
            temperature: temperature.trim() || null,
            promptVersion: promptVersion.trim() || null,
          },
          randomizedPlan: nextPlan,
        },
      }),
    });
    const payload = (await response.json()) as { session?: { id: string }; error?: string };
    if (!response.ok || !payload.session?.id) throw new Error(payload.error ?? "Agent 会话创建失败");
    return payload.session.id;
  };

  const begin = async () => {
    if (!bundle) return;
    setBusy(true);
    setError("");
    try {
      if (!runCode.trim()) throw new Error("请输入唯一 Agent Run ID。");
      if (!modelName.trim()) throw new Error("请输入模型或 Agent 名称。");
      const nextPlan = makeTrialPlan(bundle, {
        module: isPilot ? "disclosure" : moduleKey,
        taskType: isPilot ? "T2" : taskType,
        metric: isPilot ? "price" : metric,
        resolution: isPilot ? "weekly" : resolution,
        scaleMode: isPilot ? "linear" : scaleMode,
        disclosurePath: isPilot ? "combined" : disclosurePath,
        snapshot,
        assetId,
        robustnessFactor,
        windowMode: isPilot ? "whole" : windowMode,
      });
      if (!nextPlan.length) throw new Error("当前条件没有可用曲线，请调整配置。");
      setPlan(nextPlan);
      setTrialIndex(0);
      setDisclosureIndex(0);
      setAnswers([]);
      setSessionId(await createSession(nextPlan));
      prepareStep(nextPlan[0].taskType);
      setPhase("experiment");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Agent 实验启动失败");
    } finally {
      setBusy(false);
    }
  };

  const completeSession = async () => {
    const response = await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Agent 会话完成状态写入失败");
    setPhase("complete");
  };

  const submitAgentResponse = async (submitTimestamp: number) => {
    if (!bundle || !currentTrial || !currentDisclosure || !points.length || !sessionId) return;
    if (!stagedBoundary || responseStage !== "annotation") {
      setError("请先校验并锁定边界 JSON。");
      return;
    }
    setError("");
    let parsed: AgentSubmissionInput;
    try {
      parsed = JSON.parse(draft) as AgentSubmissionInput;
    } catch {
      setError("JSON 无法解析。请检查引号、逗号和括号。");
      return;
    }

    const pairs = stagedBoundary.pairs;

    const cueTags = Array.isArray(parsed.cue_tags)
      ? parsed.cue_tags.filter((value): value is string => typeof value === "string")
      : [];
    const allowedCues = new Map(activeCueSet.options.map((option) => [option.code, option]));
    if (
      cueTags.length < 1 ||
      cueTags.length !== new Set(cueTags).size ||
      cueTags.some((code) => !allowedCues.has(code))
    ) {
      setError("cue_tags 至少选择一个当前允许的唯一代码。");
      return;
    }
    const exclusiveSelected = cueTags.some((code) => allowedCues.get(code)?.exclusive);
    if (exclusiveSelected && cueTags.length !== 1) {
      setError("exclusive 线索代码不能与其他 cue_tags 同时提交。");
      return;
    }

    const influenceRequired = currentTrial.module === "disclosure" && disclosureIndex > 0;
    const influenceRating = parsed.influence_rating;
    if (
      influenceRequired &&
      (typeof influenceRating !== "number" || !Number.isInteger(influenceRating) || influenceRating < 1 || influenceRating > 5)
    ) {
      setError("当前步骤 influence_rating 必须是 1—5 的整数。");
      return;
    }
    if (!influenceRequired && influenceRating !== null && influenceRating !== undefined) {
      setError("当前步骤 influence_rating 必须为 null。");
      return;
    }

    const ratios = pairs.map((pair) => pair.ratio);
    const widths = pairs.map((pair) => pair.width);
    const sameAsPrevious = previousAnswer
      ? sameNumbers(ratios, previousRatios) && widths.every(
          (width, index) => width === previousAnswer.boundaryIntervals[index]?.halfWidthRatio,
        )
      : false;
    if (
      currentTrial.module === "disclosure" &&
      disclosureIndex > 0 &&
      sameAsPrevious &&
      parsed.no_change_confirmed !== true
    ) {
      setError("答案与上一步完全相同；请将 no_change_confirmed 设为 true，或修改边界/范围。");
      return;
    }

    const currentBoundaryRecords = boundaryRecords(ratios, points);
    const currentIntervalRecords = intervalRecords(ratios, widths, points);
    const stimulusType = currentControl?.kind ?? "crypto";
    const disclosureState = {
      key: currentDisclosure,
      path: currentTrial.module === "disclosure" ? disclosurePath : "snapshot",
      visibility,
      cueSchemaVersion: CUE_SCHEMA_VERSION,
      cueSetKey: currentDisclosure,
      sourceWindow,
      displayedWindow,
      curatedWindow: currentTrial.windowMode === "truncated" ? bundle.curatedWindow ?? { start: curatedStart, end: curatedEnd } : null,
      visibleEventPriorities: [
        ...(visibility.highEvents ? ["high"] : []),
        ...(visibility.lowEvents ? ["low"] : []),
      ],
      visibleSourcePriorities: [...new Set(visibleEvents.map((event) => event.sourcePriority ?? (event.priority === "high" ? 1 : 3)))].sort((first, second) => first - second),
      eventProtocol: {
        version: EVENT_SELECTION_PROTOCOL,
        sourceDataset: "events_20260527.zip",
        priorityBands: { core: [1, 2], supplementary: [3, 4, 5] },
        maximumNewEventsPerDisclosure: MAX_EVENTS_PER_DISCLOSURE,
        overflowRule: "chronological-even-spacing-with-endpoints",
        newlyDisclosedEventIds: newlyDisclosedEvents.map((event) => event.sourceId ?? `${event.date}:${event.title}`),
      },
      agentInterfaceVersion: "agent-native-json-v2-layer-major-six-assets",
    };
    const stimulusWindow = {
      mode: currentTrial.windowMode,
      source: sourceWindow,
      displayed: displayedWindow,
      curatedRule: currentTrial.windowMode === "truncated" ? bundle.curatedWindow ?? { start: curatedStart, end: curatedEnd } : null,
    };
    const elapsedMs = Math.max(0, Math.round(submitTimestamp - stepStartedAt.current));

    setBusy(true);
    try {
      const response = await fetch("/api/modular-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          trialId: currentTrial.id,
          trialOrder: currentTrial.order,
          responseVersion: "agent-v2",
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
          stimulusWindow,
          cueSchemaVersion: CUE_SCHEMA_VERSION,
          boundaries: currentBoundaryRecords,
          previousBoundaries: previousAnswer?.boundaries ?? [],
          boundaryIntervals: currentIntervalRecords,
          singleStageConfirmed: stagedBoundary.singleStageConfirmed,
          influenceRating: influenceRequired ? influenceRating : null,
          influenceTouched: influenceRequired,
          noChangeConfirmed: parsed.no_change_confirmed === true,
          cueTags,
          rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
          elapsedMs,
          revealReadMs: elapsedMs,
          firstMoveMs: null,
          firstUncertaintyMs: null,
          adjustmentCount: 0,
          uncertaintyAdjustmentCount: 0,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Agent 回答记录失败");

      const answer: AgentAnswer = {
        trialId: currentTrial.id,
        trialOrder: currentTrial.order,
        disclosureIndex,
        disclosureKey: currentDisclosure,
        boundaries: currentBoundaryRecords,
        boundaryIntervals: currentIntervalRecords,
      };
      const nextAnswers = [...answers, answer];
      setAnswers(nextAnswers);

      if (currentTrial.module === "disclosure") {
        if (trialIndex < plan.length - 1) {
          const nextTrialIndex = trialIndex + 1;
          const nextTrial = plan[nextTrialIndex];
          prepareStep(nextTrial.taskType, priorAnswerForPosition(nextTrial, disclosureIndex, nextAnswers));
          setTrialIndex(nextTrialIndex);
        } else if (disclosureIndex < currentTrial.disclosures.length - 1) {
          const nextDisclosureIndex = disclosureIndex + 1;
          const nextTrial = plan[0];
          prepareStep(nextTrial.taskType, priorAnswerForPosition(nextTrial, nextDisclosureIndex, nextAnswers));
          setTrialIndex(0);
          setDisclosureIndex(nextDisclosureIndex);
        } else {
          await completeSession();
        }
      } else if (disclosureIndex < currentTrial.disclosures.length - 1) {
        prepareStep(currentTrial.taskType, answer);
        setDisclosureIndex((value) => value + 1);
      } else if (trialIndex < plan.length - 1) {
        prepareStep(plan[trialIndex + 1].taskType);
        setTrialIndex((value) => value + 1);
        setDisclosureIndex(0);
      } else {
        await completeSession();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Agent 回答记录失败");
    } finally {
      setBusy(false);
    }
  };

  const moduleInfo = MODULES.find((module) => module.key === moduleKey) ?? MODULES[0];

  if (phase === "setup") {
    return (
      <main className="agent-site">
        <header className="agent-header">
          <Link href="/">Boundary Lab / Agent</Link>
          <code>{isPilot ? "M1_FIXED" : "FULL_MODULAR_PROTOCOL"}</code>
        </header>
        <section className="agent-setup">
          <div className="agent-intro">
            <p>AGENT-NATIVE EXPERIMENT INTERFACE v2</p>
            <h1>{isPilot ? "M1 Agent 初批实验" : "Agent 全模块实验"}</h1>
            <p>{isPilot ? "曲线与披露状态和人类版本一致。差别仅在作答通道：Agent 读取当前观察对象和同一张图，以严格 JSON 提交答案，不使用拖拽、奖励页或视觉化控件。" : "这里汇总原研究控制台的 M1—M4 条件。为本次 Agent 运行锁定模块、任务、指标和呈现条件后，Agent 将读取当前观察对象与同一张图，并以严格 JSON 逐步提交。"}</p>
          </div>

          {isPilot ? (
            <section className="agent-fixed-protocol">
              <h2>LOCKED_PROTOCOL</h2>
              <dl>
                <div><dt>module</dt><dd>M1 / disclosure</dd></div>
                <div><dt>task</dt><dd>T2 / 2 boundaries / 3 stages</dd></div>
                <div><dt>stimuli</dt><dd>BTC, ETH, SOL, BNB, XRP, DOGE / randomized</dd></div>
                <div><dt>display</dt><dd>price / weekly / linear / whole window</dd></div>
                <div><dt>disclosures</dt><dd>G0 + GI1 + GI2 + DI1 + DI2 + DI3 + DI4</dd></div>
                <div><dt>flow</dt><dd>disclosure-major / six series per layer</dd></div>
                <div><dt>expected responses</dt><dd>42</dd></div>
              </dl>
            </section>
          ) : (
            <section className="agent-config" aria-label="Agent 实验配置">
              <h2>EXPERIMENT_CONFIG</h2>
              <label><span>module</span><select value={moduleKey} onChange={(event) => {
                const value = event.target.value as ModuleKey;
                setModuleKey(value);
                if (value === "cross-series") {
                  if (!["bitcoin", "ethereum"].includes(assetId)) setAssetId("bitcoin");
                  if (resolution === "daily") setResolution("weekly");
                }
                if (value === "robustness" && !["G0", "GI1", "GI2"].includes(snapshot)) setSnapshot("GI2");
              }}>{MODULES.map((module) => <option key={module.key} value={module.key}>{module.number} · {module.title}</option>)}</select></label>
              {moduleKey !== "framing" && <label><span>task_type</span><select value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}>{(["T1", "T2", "T3"] as TaskType[]).map((task) => <option key={task} value={task}>{task} · {TASKS[task].short}</option>)}</select></label>}
              {(moduleKey === "disclosure" || moduleKey === "framing") && <label><span>metric</span><select value={metric} onChange={(event) => { const value = event.target.value as MetricKey; setMetric(value); if (value === "googleTrends" && resolution === "daily") setResolution("weekly"); if (value !== "price") setScaleMode("linear"); }}>{(Object.keys(METRIC_LABEL) as MetricKey[]).map((key) => <option key={key} value={key}>{METRIC_LABEL[key]}</option>)}</select></label>}
              {(moduleKey === "cross-series" || moduleKey === "robustness") && <label><span>asset</span><select value={assetId} onChange={(event) => setAssetId(event.target.value)}>{(bundle?.assets ?? []).filter((asset) => moduleKey !== "cross-series" || ["bitcoin", "ethereum"].includes(asset.id)).map((asset) => <option key={asset.id} value={asset.id}>{asset.nameZh} · {asset.symbol}</option>)}</select></label>}
              {moduleKey === "disclosure" && <label><span>disclosure_path</span><select value={disclosurePath} onChange={(event) => setDisclosurePath(event.target.value as DisclosurePath)}><option value="general">general / G0+2</option><option value="domain">domain / G0+4</option><option value="combined">combined / G0+6</option></select></label>}
              {moduleKey !== "disclosure" && <label><span>information_snapshot</span><select value={snapshot} onChange={(event) => setSnapshot(event.target.value as DisclosureKey)}>{SNAPSHOT_OPTIONS.filter((key) => moduleKey !== "robustness" || ["G0", "GI1", "GI2"].includes(key)).map((key) => <option key={key} value={key}>{key} · {DISCLOSURE_COPY[key].title}</option>)}</select></label>}
              {moduleKey === "robustness" && <label><span>robustness_factor</span><select value={robustnessFactor} onChange={(event) => setRobustnessFactor(event.target.value as RobustnessFactor)}><option value="resolution">resolution</option><option value="scale">scale</option><option value="window">window</option><option value="controls">controls</option></select></label>}
              {moduleKey !== "robustness" && <label><span>resolution</span><select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}><option value="daily" disabled={metric === "googleTrends" || moduleKey === "cross-series"}>daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly">yearly</option></select></label>}
              {moduleKey !== "robustness" && <label><span>scale_mode</span><select value={scaleMode} disabled={metric !== "price" && moduleKey !== "cross-series"} onChange={(event) => setScaleMode(event.target.value as ScaleMode)}><option value="linear">linear</option><option value="log">log</option></select></label>}
              {!(moduleKey === "robustness" && robustnessFactor === "window") && <label><span>window_mode</span><select value={windowMode} onChange={(event) => setWindowMode(event.target.value as WindowMode)}><option value="whole">whole</option><option value="truncated">2020-01-01—2024-12-31</option></select></label>}
              <p className="agent-config-summary">{moduleInfo.number} / {moduleInfo.english} / {moduleInfo.design}</p>
            </section>
          )}

          <section className="agent-run-metadata">
            <h2>RUN_METADATA</h2>
            <label><span>run_id *</span><input value={runCode} onChange={(event) => setRunCode(event.target.value)} placeholder="agent-run-001" maxLength={64} /></label>
            <label><span>model_or_agent_name *</span><input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="model + version" maxLength={120} /></label>
            <label><span>provider</span><input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="optional" maxLength={80} /></label>
            <label><span>temperature</span><input value={temperature} onChange={(event) => setTemperature(event.target.value)} placeholder="optional; e.g. 0" maxLength={20} /></label>
            <label><span>prompt_version</span><input value={promptVersion} onChange={(event) => setPromptVersion(event.target.value)} maxLength={80} /></label>
          </section>

          <section className="agent-rules">
            <h2>EXECUTION_RULES</h2>
            <ol>
              <li>只使用当前页面明确呈现的观察对象与图像。</li>
              <li>不得查看源代码、网络请求、完整数据包、未来披露或外部资料。</li>
              <li>每一步独立提交；提交后不能修改。</li>
              <li>先提交边界与不确定范围；通过校验后才会显示线索代码与影响评分。</li>
              <li>ratio 使用整个当前显示时间窗的 0—1 归一化位置。</li>
              <li>不确定范围只能使用页面列出的五个 half-width 值。</li>
            </ol>
          </section>

          {(loadError || error) && <pre className="agent-error" role="alert">ERROR: {loadError || error}</pre>}
          <button className="agent-primary" type="button" onClick={begin} disabled={!bundle || busy || Boolean(loadError)}>{busy ? "INITIALIZING…" : "INITIALIZE SESSION"}</button>
        </section>
      </main>
    );
  }

  if (phase === "complete") {
    return (
      <main className="agent-site agent-complete">
        <section>
          <p>SESSION_COMPLETE</p>
          <h1>{isPilot ? "M1 Agent 初批实验完成" : "Agent 全模块实验完成"}</h1>
          <pre>{JSON.stringify({ session_id: sessionId, response_count: answers.length, status: "complete" }, null, 2)}</pre>
          <p>所有逐步响应已写入与人类实验相同的数据库表。研究者可从结果页按实验臂导出。</p>
          <div><Link href="/research/results">RESEARCH EXPORT</Link><button type="button" onClick={() => window.location.reload()}>NEW SESSION</button></div>
        </section>
      </main>
    );
  }

  if (!bundle || !currentTrial || !currentDisclosure || !currentMetric || !points.length || !observation) {
    return <main className="agent-site agent-fatal"><pre>ERROR: experiment state unavailable</pre></main>;
  }

  return (
    <main className="agent-site agent-runner">
      <header className="agent-header">
        <span>Boundary Lab / Agent Runtime</span>
        <code>SESSION {sessionId.slice(0, 8)} · LAYER {disclosureIndex + 1}/{currentTrial.disclosures.length} · SERIES {trialIndex + 1}/{plan.length}</code>
      </header>

      <section className="agent-observation-meta">
        <div><span>DISCLOSURE</span><strong>{currentDisclosure} / {DISCLOSURE_COPY[currentDisclosure].title}</strong></div>
        <div><span>TASK</span><strong>{currentTrial.taskType} / {TASKS[currentTrial.taskType].short}</strong></div>
        <div><span>VISIBLE IDENTITY</span><strong>{visibility.asset ? `${displayName} (${displaySymbol})` : "null"}</strong></div>
        <div><span>VISIBLE METRIC</span><strong>{visibility.metric ? currentMetric.name : "null"}</strong></div>
      </section>

      <section className="agent-runtime-grid">
        <div className="agent-stimulus">
          <h1>{visibility.asset ? `${displayName}（${displaySymbol}）` : visibility.metric ? currentMetric.name : "UNNAMED SERIES"}</h1>
          <p>{visibility.intro ? displayIntro : visibility.metric ? currentMetric.definition : "仅根据当前可见曲线判断阶段结构。"}</p>
          {currentTrial.taskType === "T3" && <pre className="agent-definition">STAGE_DEFINITION: {STAGE_DEFINITION}</pre>}
          <ModularChart
            points={points}
            metric={currentTrial.metric}
            unit={currentMetric.unit}
            resolution={currentTrial.resolution}
            scaleMode={currentTrial.scaleMode}
            visibility={visibility}
            boundaries={previewBoundaries}
            widths={previewWidths}
            previousBoundaries={currentTrial.module === "disclosure" && disclosureIndex > 0 ? previousRatios : []}
            events={visibleEvents}
            taskType={currentTrial.taskType}
            onBoundariesChange={() => {}}
            onBoundaryInteraction={() => {}}
            interactive={false}
          />
          {visibleEvents.length > 0 && <section className="agent-events"><h2>VISIBLE_EVENTS · NEW {newlyDisclosedEvents.length} / MAX {MAX_EVENTS_PER_DISCLOSURE}</h2>{visibleEvents.map((event) => <article key={event.sourceId ?? `${event.date}-${event.title}`}><code>{event.date} / P{event.sourcePriority ?? (event.priority === "high" ? 1 : 3)}{newlyDisclosedEvents.includes(event) ? " / NEW" : " / RETAINED"}</code><strong>{event.title}</strong><p>{event.description}</p></article>)}</section>}
        </div>

        <aside className="agent-io">
          <section>
            <h2>CURRENT_OBSERVATION</h2>
            <pre>{JSON.stringify(observation, null, 2)}</pre>
          </section>
          <section>
            <h2>{responseStage === "boundary" ? "BOUNDARY_JSON" : "ANNOTATION_JSON"}</h2>
            <p>{responseStage === "boundary" ? "先提交边界与不确定范围。只有通过校验后，判断线索和影响评分才会显示，顺序与人类页面一致。" : "边界已经暂存。现在选择本步实际使用的线索并填写影响评分；如需调整边界，可返回上一阶段。"}</p>
            <textarea value={draft} onChange={(event) => handleDraftChange(event.target.value)} spellCheck={false} aria-label="Agent response JSON" />
          </section>
          {error && <pre className="agent-error" role="alert">ERROR: {error}</pre>}
          {responseStage === "boundary" ? (
            <button className="agent-primary" type="button" onClick={stageAgentBoundaries}>VALIDATE BOUNDARIES + REVEAL ANNOTATION</button>
          ) : (
            <>
              <button className="agent-secondary" type="button" onClick={editStagedBoundaries} disabled={busy}>EDIT BOUNDARIES</button>
              <button className="agent-primary" type="button" onClick={(event) => submitAgentResponse(event.timeStamp)} disabled={busy}>{busy ? "PERSISTING…" : currentTrial.module === "disclosure" ? trialIndex < plan.length - 1 ? "SUBMIT + NEXT SERIES / SAME LAYER" : disclosureIndex < currentTrial.disclosures.length - 1 ? "SUBMIT + NEXT DISCLOSURE LAYER" : "SUBMIT + COMPLETE" : disclosureIndex < currentTrial.disclosures.length - 1 ? "SUBMIT + NEXT DISCLOSURE" : trialIndex < plan.length - 1 ? "SUBMIT + NEXT TRIAL" : "SUBMIT + COMPLETE"}</button>
            </>
          )}
          <p className="agent-lock">IMMUTABLE AFTER SUBMIT · DATABASE WRITE PER RESPONSE</p>
        </aside>
      </section>
    </main>
  );
}
