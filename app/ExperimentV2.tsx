"use client";

import {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";

type PricePoint = {
  index: number;
  date: string;
  weekEnd: string;
  price: number;
  normalized: number;
};

type MarketEvent = {
  date: string;
  label: string;
  category: string;
  sourceUrl: string;
};

type Curve = {
  id: string;
  asset: {
    name: string;
    nameZh: string;
    symbol: string;
    currency: string;
  };
  source: {
    project: string;
    sourceFile: string;
    aggregation: string;
    window: { start: string; end: string };
    priceMin: number;
    priceMax: number;
    displayNormalization: string;
  };
  points: PricePoint[];
  events: MarketEvent[];
};

type StimulusSet = {
  protocolVersion: string;
  dataset: {
    project: string;
    frozenCohortCount: number;
    currentRuleValidCount: number;
    rawTsvCount: number;
    pilotCurveCount: number;
    eventSetStatus: string;
  };
  curves: Curve[];
};

type BoundaryPair = [number | null, number | null];

type Decision = {
  curveId: string;
  disclosureLevel: number;
  disclosureKey: string;
  boundary1Index: number;
  boundary2Index: number;
  boundary1Ratio: number;
  boundary2Ratio: number;
  boundary1Date: string;
  boundary2Date: string;
  confidence: number;
  influenceRating: number;
  cueTags: string[];
  rationale: string;
  elapsedMs: number;
  revealReadMs: number;
  firstMoveMs: number | null;
  adjustmentCount: number;
};

const DISCLOSURES = [
  {
    key: "shape",
    short: "走势",
    title: "先只看这段走势",
    newInfo: "一条没有名称和背景信息的价格走势",
    hidden: "坐标、币种、日期、价格和事件",
    prompt: "请在曲线上选两个分界点，把整段走势分成三个阶段。",
  },
  {
    key: "coordinates",
    short: "坐标",
    title: "现在显示坐标信息",
    newInfo: "相对位置、标准化价格，以及每个点代表连续 7 日开盘价的平均值",
    hidden: "币种、真实日期、美元价格和事件",
    prompt: "请再次判断两个分界点的位置；如果看法没变，可以保持不动。",
  },
  {
    key: "identity",
    short: "币种",
    title: "现在告诉你这是什么资产",
    newInfo: "币种名称和交易符号",
    hidden: "真实日期、美元价格和事件",
    prompt: "知道币种后，请再次判断两个分界点是否需要调整。",
  },
  {
    key: "dates",
    short: "日期",
    title: "现在显示真实日期",
    newInfo: "这段走势对应的年份、日期和周度时间轴",
    hidden: "美元价格和事件",
    prompt: "看到真实日期后，请再次判断两个分界点的位置。",
  },
  {
    key: "prices",
    short: "价格",
    title: "现在显示美元价格",
    newInfo: "每周平均开盘价和 USD 纵轴；曲线形状保持不变",
    hidden: "事件位置和事件名称",
    prompt: "看到真实价格后，请再次判断两个分界点的位置。",
  },
  {
    key: "event_positions",
    short: "位置",
    title: "现在显示候选事件的位置",
    newInfo: "六个编号位置；暂不显示事件名称",
    hidden: "事件名称和内容",
    prompt: "只看到这些位置标记时，请再次判断两个分界点的位置。",
  },
  {
    key: "event_labels",
    short: "事件",
    title: "现在显示候选事件的名称",
    newInfo: "六个事件的日期和中性描述",
    hidden: "无",
    prompt: "看到事件名称后，请完成这条走势的最后一次判断。",
  },
] as const;

const CHART = { width: 1040, height: 500, left: 82, right: 30, top: 40, bottom: 72 };
const MIN_GAP = 8;

const BASE_CUES = ["趋势方向", "涨跌速度", "高低点", "波动变化"];
const LAYER_CUES = [
  [],
  ["坐标与频率"],
  ["币种知识"],
  ["日期记忆"],
  ["价格水平"],
  ["事件位置"],
  ["事件内容"],
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 10 ? 2 : 0,
  }).format(value);
}

function nearestEventPoint(points: PricePoint[], eventDate: string) {
  const target = new Date(`${eventDate}T00:00:00Z`).getTime();
  return points.reduce(
    (best, point) => {
      const distance = Math.abs(new Date(`${point.date}T00:00:00Z`).getTime() - target);
      return distance < best.distance ? { point, distance } : best;
    },
    { point: points[0], distance: Number.POSITIVE_INFINITY },
  ).point;
}

function shuffleIndexes(length: number) {
  const result = Array.from({ length }, (_, index) => index);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const target = Math.floor(random * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function layerElasticity(current: Decision, previous: Decision) {
  return (
    Math.abs(current.boundary1Ratio - previous.boundary1Ratio) +
    Math.abs(current.boundary2Ratio - previous.boundary2Ratio)
  ) / 2;
}

export function ExperimentV2() {
  const [stimuli, setStimuli] = useState<StimulusSet | null>(null);
  const [screen, setScreen] = useState<"welcome" | "experiment" | "between" | "complete">(
    "welcome",
  );
  const [sessionId, setSessionId] = useState("");
  const [participantCode, setParticipantCode] = useState("");
  const [expertise, setExpertise] = useState("none");
  const [consented, setConsented] = useState(false);
  const [curveOrder, setCurveOrder] = useState<number[]>([]);
  const [curvePosition, setCurvePosition] = useState(0);
  const [level, setLevel] = useState(0);
  const [boundaries, setBoundaries] = useState<BoundaryPair>([null, null]);
  const [confidence, setConfidence] = useState(3);
  const [influenceRating, setInfluenceRating] = useState<number | null>(null);
  const [cueTags, setCueTags] = useState<string[]>([]);
  const [rationale, setRationale] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showReveal, setShowReveal] = useState(false);
  const [selectedResultCurveId, setSelectedResultCurveId] = useState("");

  const chartRef = useRef<SVGSVGElement | null>(null);
  const activeBoundary = useRef<0 | 1 | null>(null);
  const roundStartedAt = useRef<number | null>(null);
  const roundStartedEventTime = useRef<number | null>(null);
  const revealShownAt = useRef<number | null>(null);
  const revealReadMs = useRef(0);
  const firstMoveAt = useRef<number | null>(null);
  const adjustmentCount = useRef(0);

  useEffect(() => {
    fetch("/data/asset-stimuli-v2.json")
      .then((response) => {
        if (!response.ok) throw new Error("实验曲线加载失败，请稍后刷新页面");
        return response.json() as Promise<StimulusSet>;
      })
      .then(setStimuli)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const orderedCurves = useMemo(
    () => curveOrder.map((index) => stimuli?.curves[index]).filter(Boolean) as Curve[],
    [curveOrder, stimuli],
  );
  const curve = orderedCurves[curvePosition] ?? null;
  const disclosure = DISCLOSURES[level];
  const pointCount = curve?.points.length ?? 0;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;

  const linePath = useMemo(() => {
    if (!curve) return "";
    return curve.points
      .map((point, index) => {
        const x = CHART.left + (index / Math.max(curve.points.length - 1, 1)) * plotWidth;
        const y = CHART.top + (1 - point.normalized) * plotHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [curve, plotHeight, plotWidth]);

  const eventPoints = useMemo(
    () =>
      curve?.events.map((event) => ({
        event,
        point: nearestEventPoint(curve.points, event.date),
      })) ?? [],
    [curve],
  );

  const currentCurveDecisions = useMemo(
    () => (curve ? decisions.filter((decision) => decision.curveId === curve.id) : []),
    [curve, decisions],
  );
  const previousDecision = level > 0 ? currentCurveDecisions[level - 1] : null;
  const hoverPoint = hoverIndex === null ? null : curve?.points[hoverIndex] ?? null;

  const xForIndex = (index: number) =>
    CHART.left + (index / Math.max(pointCount - 1, 1)) * plotWidth;
  const yForPoint = (point: PricePoint) => CHART.top + (1 - point.normalized) * plotHeight;

  function clientXToIndex(clientX: number) {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || !pointCount) return 0;
    const svgX = ((clientX - rect.left) / rect.width) * CHART.width;
    const ratio = clamp((svgX - CHART.left) / plotWidth, 0, 1);
    return Math.round(ratio * (pointCount - 1));
  }

  function markAdjustment(timestamp: number) {
    if (firstMoveAt.current === null) firstMoveAt.current = timestamp;
    adjustmentCount.current += 1;
  }

  function moveBoundary(slot: 0 | 1, nextIndex: number) {
    setBoundaries(([first, second]) => {
      if (slot === 0) {
        const maximum = second === null ? pointCount - 1 : second - MIN_GAP;
        return [clamp(nextIndex, 1, maximum), second];
      }
      const minimum = first === null ? 1 : first + MIN_GAP;
      return [first, clamp(nextIndex, minimum, pointCount - 2)];
    });
  }

  function placeBoundary(nextIndex: number) {
    setBoundaries(([first, second]) => {
      if (first === null) return [clamp(nextIndex, 1, pointCount - 2), null];
      if (second === null) {
        if (Math.abs(nextIndex - first) < MIN_GAP) {
          const adjusted = nextIndex >= first ? first + MIN_GAP : first - MIN_GAP;
          return [Math.min(first, adjusted), Math.max(first, adjusted)];
        }
        return [Math.min(first, nextIndex), Math.max(first, nextIndex)];
      }
      const slot: 0 | 1 =
        Math.abs(nextIndex - first) <= Math.abs(nextIndex - second) ? 0 : 1;
      if (slot === 0) return [clamp(nextIndex, 1, second - MIN_GAP), second];
      return [first, clamp(nextIndex, first + MIN_GAP, pointCount - 2)];
    });
  }

  function handleChartPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!curve || showReveal) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    markAdjustment(event.timeStamp);
    placeBoundary(clientXToIndex(event.clientX));
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!curve || showReveal) return;
    const index = clientXToIndex(event.clientX);
    if (activeBoundary.current !== null) moveBoundary(activeBoundary.current, index);
    setHoverIndex(index);
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    activeBoundary.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function openReveal() {
    setShowReveal(true);
    revealShownAt.current = Date.now();
    roundStartedAt.current = null;
    roundStartedEventTime.current = null;
    firstMoveAt.current = null;
    adjustmentCount.current = 0;
  }

  function acknowledgeReveal(event: ReactMouseEvent<HTMLButtonElement>) {
    const now = Date.now();
    revealReadMs.current = revealShownAt.current === null ? 0 : now - revealShownAt.current;
    roundStartedAt.current = now;
    roundStartedEventTime.current = event.timeStamp;
    firstMoveAt.current = null;
    adjustmentCount.current = 0;
    setShowReveal(false);
  }

  async function startExperiment() {
    if (!stimuli || !consented) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorType: "human",
          participantCode,
          expertise,
          experimentalArm: "trajectory-four-asset",
          protocolVersion: stimuli.protocolVersion,
        }),
      });
      const result = (await response.json()) as { session?: { id: string }; error?: string };
      if (!response.ok || !result.session) {
        throw new Error(result.error ?? "暂时无法建立匿名实验会话");
      }
      setSessionId(result.session.id);
      setCurveOrder(shuffleIndexes(stimuli.curves.length));
      setCurvePosition(0);
      setLevel(0);
      setBoundaries([null, null]);
      setScreen("experiment");
      setTimeout(openReveal, 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法开始实验");
    } finally {
      setBusy(false);
    }
  }

  function resetRoundInputs() {
    setConfidence(3);
    setInfluenceRating(null);
    setCueTags([]);
    setRationale("");
    setHoverIndex(null);
  }

  async function submitDecision() {
    if (
      !curve ||
      !sessionId ||
      boundaries[0] === null ||
      boundaries[1] === null ||
      (level > 0 && influenceRating === null)
    ) {
      return;
    }
    const [boundary1Index, boundary2Index] = boundaries as [number, number];
    const submittedAt = Date.now();
    const elapsedMs = roundStartedAt.current === null ? 0 : submittedAt - roundStartedAt.current;
    const firstMoveMs =
      roundStartedEventTime.current === null || firstMoveAt.current === null
        ? null
        : Math.max(0, firstMoveAt.current - roundStartedEventTime.current);
    const decision: Decision = {
      curveId: curve.id,
      disclosureLevel: level,
      disclosureKey: disclosure.key,
      boundary1Index,
      boundary2Index,
      boundary1Ratio: boundary1Index / (pointCount - 1),
      boundary2Ratio: boundary2Index / (pointCount - 1),
      boundary1Date: curve.points[boundary1Index].date,
      boundary2Date: curve.points[boundary2Index].date,
      confidence,
      influenceRating: level === 0 ? 0 : influenceRating ?? 0,
      cueTags,
      rationale: rationale.trim(),
      elapsedMs,
      revealReadMs: revealReadMs.current,
      firstMoveMs,
      adjustmentCount: adjustmentCount.current,
    };

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, ...decision }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "本轮答案保存失败");

      const nextDecisions = [...decisions, decision];
      setDecisions(nextDecisions);

      if (level < DISCLOSURES.length - 1) {
        setLevel((current) => current + 1);
        resetRoundInputs();
        setTimeout(openReveal, 0);
      } else if (curvePosition < orderedCurves.length - 1) {
        resetRoundInputs();
        setScreen("between");
      } else {
        const completion = await fetch("/api/sessions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!completion.ok) {
          console.error("The final decision was saved, but session completion was not acknowledged.");
        }
        setSelectedResultCurveId(orderedCurves[0]?.id ?? curve.id);
        setScreen("complete");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "本轮答案保存失败");
    } finally {
      setBusy(false);
    }
  }

  function beginNextCurve() {
    setCurvePosition((current) => current + 1);
    setLevel(0);
    setBoundaries([null, null]);
    resetRoundInputs();
    setScreen("experiment");
    setTimeout(openReveal, 0);
  }

  function resetToPrevious(event: ReactMouseEvent<HTMLButtonElement>) {
    markAdjustment(event.timeStamp);
    if (!previousDecision) {
      setBoundaries([null, null]);
      return;
    }
    setBoundaries([previousDecision.boundary1Index, previousDecision.boundary2Index]);
  }

  function toggleCue(cue: string) {
    setCueTags((current) =>
      current.includes(cue) ? current.filter((item) => item !== cue) : [...current, cue],
    );
  }

  function downloadSession() {
    if (!stimuli) return;
    const payload = {
      sessionId,
      protocolVersion: stimuli.protocolVersion,
      expertise,
      curveOrder: orderedCurves.map((item) => item.id),
      decisions,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boundary-lab-${sessionId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (screen === "welcome") {
    return (
      <main className="v2-welcome">
        <header className="v2-brandbar">
          <a className="v2-brand" href="#top" aria-label="Boundary Lab 首页">
            <span className="v2-brand-icon" aria-hidden="true"><i /><i /></span>
            <span><strong>BOUNDARY LAB</strong><small>阶段判断与语境研究</small></span>
          </a>
          <span className="v2-prototype-badge">预测试版本 · v2</span>
        </header>

        <section className="v2-welcome-grid" id="top">
          <div className="v2-hero">
            <p className="v2-eyebrow">同一段走势 · 一步步增加信息</p>
            <h1>你的分界点，<br /><em>会不会移动？</em></h1>
            <p className="v2-hero-copy">
              你会看到四条匿名的加密资产走势。每条走势都要用两个分界点分成三个阶段，
              随后我们会逐步显示坐标、币种、日期、价格和事件。
            </p>

            <div className="v2-facts" aria-label="实验概况">
              <div><strong>4</strong><span>条匿名走势</span></div>
              <div><strong>2</strong><span>个固定分界点</span></div>
              <div><strong>7</strong><span>步信息变化</span></div>
            </div>

            <div className="v2-protocol-card">
              <div className="v2-protocol-heading">
                <span>每条走势的七个步骤</span>
                <small>每一步都可以保持原判断</small>
              </div>
              <ol>
                {DISCLOSURES.map((item, index) => (
                  <li key={item.key}><span>{index + 1}</span><strong>{item.short}</strong></li>
                ))}
              </ol>
            </div>
          </div>

          <aside className="v2-start-card">
            <div className="v2-start-topline"><span>匿名研究</span><small>约 20–25 分钟</small></div>
            <h2>准备好后开始</h2>
            <p>
              这里没有标准答案。你可以根据趋势、涨跌速度、波动或其他你认为重要的特征来划分阶段。
            </p>

            <label htmlFor="v2-participant-code">匿名代码 <span>可不填</span></label>
            <input
              id="v2-participant-code"
              value={participantCode}
              maxLength={64}
              placeholder="例如 P-017"
              onChange={(event) => setParticipantCode(event.target.value)}
            />

            <label htmlFor="v2-expertise">你平时对加密资产的了解程度</label>
            <select
              id="v2-expertise"
              value={expertise}
              onChange={(event) => setExpertise(event.target.value)}
            >
              <option value="none">基本不了解</option>
              <option value="casual">偶尔关注</option>
              <option value="active">经常交易或研究</option>
              <option value="professional">专业工作相关</option>
            </select>

            <label className="v2-consent">
              <input
                type="checkbox"
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
              />
              <span>
                我理解这是匿名研究预测试，并同意记录每一步的分界点、信心、判断依据和作答时间。
              </span>
            </label>

            {error && <p className="v2-error" role="alert">{error}</p>}
            <button
              className="v2-primary"
              disabled={!consented || !stimuli || busy}
              onClick={startExperiment}
            >
              {busy ? "正在建立匿名会话…" : stimuli ? "开始第一条走势" : "正在载入实验数据…"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="v2-ethics-note">正式招募前仍需完成伦理审批和事件集预注册。</p>
          </aside>
        </section>
      </main>
    );
  }

  if (screen === "between") {
    return (
      <main className="v2-between">
        <div className="v2-between-card">
          <span className="v2-between-count">{curvePosition + 1} / {orderedCurves.length}</span>
          <p className="v2-eyebrow">这条走势已经完成</p>
          <h1>休息一下，<br />再看下一条。</h1>
          <p>下一条会重新从匿名走势开始，仍然使用两个分界点。</p>
          <div className="v2-curve-progress" aria-label="曲线完成进度">
            {orderedCurves.map((item, index) => (
              <span key={item.id} className={index <= curvePosition ? "done" : ""}>
                {index <= curvePosition ? "✓" : index + 1}
              </span>
            ))}
          </div>
          <button className="v2-primary" onClick={beginNextCurve}>
            准备好了，看下一条 <span aria-hidden="true">→</span>
          </button>
        </div>
      </main>
    );
  }

  if (screen === "complete" && stimuli) {
    const totals = orderedCurves.map((item) => {
      const rows = decisions.filter((decision) => decision.curveId === item.id);
      return rows.slice(1).reduce(
        (sum, decision, index) => sum + layerElasticity(decision, rows[index]),
        0,
      );
    });
    const meanTotal = totals.reduce((sum, value) => sum + value, 0) / Math.max(totals.length, 1);
    const layerMeans = DISCLOSURES.slice(1).map((_, offset) => {
      const disclosureLevel = offset + 1;
      const values = orderedCurves.map((item) => {
        const rows = decisions.filter((decision) => decision.curveId === item.id);
        return layerElasticity(rows[disclosureLevel], rows[disclosureLevel - 1]);
      });
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    });
    const strongestOffset = layerMeans.indexOf(Math.max(...layerMeans));
    const selectedCurve =
      orderedCurves.find((item) => item.id === selectedResultCurveId) ?? orderedCurves[0];
    const selectedDecisions = decisions.filter(
      (decision) => decision.curveId === selectedCurve?.id,
    );

    return (
      <main className="v2-results">
        <header className="v2-brandbar v2-brandbar-dark">
          <div className="v2-brand">
            <span className="v2-brand-icon" aria-hidden="true"><i /><i /></span>
            <span><strong>BOUNDARY LAB</strong><small>本次匿名会话已完成</small></span>
          </div>
          <span className="v2-session">{sessionId.slice(0, 8)}</span>
        </header>

        <section className="v2-results-hero">
          <p className="v2-eyebrow">四条走势 · 二十八次判断</p>
          <h1>信息增加时，<br />你的分界点这样移动。</h1>
          <p>这里展示的是判断变化，不是正确率，也不提供所谓的标准答案。</p>
        </section>

        <section className="v2-summary-strip">
          <div><span>每条走势的平均累计移动</span><strong>{meanTotal.toFixed(3)}</strong><small>研究指标：上下文弹性</small></div>
          <div><span>平均影响最大的一步</span><strong>{DISCLOSURES[strongestOffset + 1].short}</strong><small>{DISCLOSURES[strongestOffset + 1].title}</small></div>
          <div><span>已保存的判断</span><strong>{decisions.length}</strong><small>4 条走势 × 7 个步骤</small></div>
        </section>

        <section className="v2-result-card">
          <div className="v2-section-heading">
            <div><p className="v2-kicker">跨走势比较</p><h2>每一步新增信息带来了多大移动</h2></div>
            <p>数值是两个分界点相对上一轮移动距离的平均值。</p>
          </div>
          <EffectMatrix curves={orderedCurves} decisions={decisions} />
        </section>

        <section className="v2-result-card">
          <div className="v2-section-heading v2-section-heading-stack">
            <div><p className="v2-kicker">单条走势回顾</p><h2>分界点在整段走势中的位置</h2></div>
            <div className="v2-result-tabs" role="tablist" aria-label="选择要回顾的币种">
              {orderedCurves.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={selectedCurve?.id === item.id}
                  className={selectedCurve?.id === item.id ? "active" : ""}
                  onClick={() => setSelectedResultCurveId(item.id)}
                >
                  {item.asset.symbol}
                </button>
              ))}
            </div>
          </div>
          {selectedCurve && (
            <>
              <BoundaryTrajectoryV2 decisions={selectedDecisions} />
              <DecisionReview curve={selectedCurve} decisions={selectedDecisions} />
            </>
          )}
        </section>

        <section className="v2-download-card">
          <div><p className="v2-kicker">保存副本</p><h2>下载本次匿名作答记录</h2><p>文件包含四条走势的分界点、信心、判断依据和作答时间。</p></div>
          <button className="v2-secondary" onClick={downloadSession}>下载 JSON</button>
        </section>
      </main>
    );
  }

  if (!curve) return <main className="v2-loading">正在准备实验走势…</main>;

  const [firstBoundary, secondBoundary] = boundaries;
  const hasBoth = firstBoundary !== null && secondBoundary !== null;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(ratio * (pointCount - 1)),
  );
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const areaPath = linePath
    ? `${linePath} L${xForIndex(pointCount - 1)},${CHART.top + plotHeight} L${CHART.left},${CHART.top + plotHeight} Z`
    : "";
  const availableCues = [...BASE_CUES, ...LAYER_CUES.slice(0, level + 1).flat()];
  const canSubmit = hasBoth && !busy && (level === 0 || influenceRating !== null);

  return (
    <main className="v2-experiment">
      <header className="v2-experiment-header">
        <div className="v2-brand v2-brand-compact">
          <span className="v2-brand-icon" aria-hidden="true"><i /><i /></span>
          <span><strong>BOUNDARY LAB</strong><small>匿名走势分段实验</small></span>
        </div>

        <div className="v2-overall-progress">
          <div className="v2-curve-indicator">
            <span>走势</span>
            {orderedCurves.map((item, index) => (
              <i
                key={item.id}
                className={index < curvePosition ? "done" : index === curvePosition ? "active" : ""}
              >
                {index < curvePosition ? "✓" : index + 1}
              </i>
            ))}
          </div>
          <div className="v2-step-indicator" aria-label={`第 ${level + 1} 步，共 7 步`}>
            {DISCLOSURES.map((item, index) => (
              <div className={index < level ? "done" : index === level ? "active" : ""} key={item.key}>
                <span>{index < level ? "✓" : index + 1}</span><small>{item.short}</small>
              </div>
            ))}
          </div>
        </div>
        <span className="v2-session">{sessionId.slice(0, 8)}</span>
      </header>

      <section className="v2-workspace">
        <div className="v2-chart-card">
          <div className="v2-chart-heading">
            <div>
              <p className="v2-round-label">第 {curvePosition + 1} 条走势 · 第 {level + 1} 步</p>
              <h1 className={level === 2 ? "v2-new-target" : ""}>
                {level >= 2
                  ? `${curve.asset.nameZh}（${curve.asset.name}，${curve.asset.symbol}）`
                  : `匿名走势 ${String(curvePosition + 1).padStart(2, "0")}`}
                {level === 2 && <span className="v2-new-tag">新增</span>}
              </h1>
              <p>{disclosure.prompt}</p>
            </div>
            <div className="v2-boundary-status">
              <span className={hasBoth ? "ready" : "waiting"}>
                {hasBoth ? "已选好两个分界点" : `还需选择 ${2 - boundaries.filter((item) => item !== null).length} 个`}
              </span>
              {level >= 1 && <small>{pointCount} 个周度数据点</small>}
            </div>
          </div>

          <div className="v2-chart-wrap">
            <svg
              ref={chartRef}
              className="v2-price-chart"
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              role="img"
              aria-label="交互式价格走势。点击两次放置分界点，也可以拖动或使用下方滑块调整。"
              onPointerDown={handleChartPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => activeBoundary.current === null && setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="v2-area-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1f6b64" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#1f6b64" stopOpacity="0" />
                </linearGradient>
              </defs>

              {level >= 1 && yTicks.map((tick) => {
                const y = CHART.top + (1 - tick) * plotHeight;
                return <line className="v2-gridline" key={`grid-${tick}`} x1={CHART.left} x2={CHART.left + plotWidth} y1={y} y2={y} />;
              })}

              {hasBoth && (
                <g className="v2-stage-regions">
                  <rect x={CHART.left} y={CHART.top} width={xForIndex(firstBoundary) - CHART.left} height={plotHeight} className="one" />
                  <rect x={xForIndex(firstBoundary)} y={CHART.top} width={xForIndex(secondBoundary) - xForIndex(firstBoundary)} height={plotHeight} className="two" />
                  <rect x={xForIndex(secondBoundary)} y={CHART.top} width={CHART.left + plotWidth - xForIndex(secondBoundary)} height={plotHeight} className="three" />
                  <text x={(CHART.left + xForIndex(firstBoundary)) / 2} y={CHART.top + 23}>阶段 1</text>
                  <text x={(xForIndex(firstBoundary) + xForIndex(secondBoundary)) / 2} y={CHART.top + 23}>阶段 2</text>
                  <text x={(xForIndex(secondBoundary) + CHART.left + plotWidth) / 2} y={CHART.top + 23}>阶段 3</text>
                </g>
              )}

              <path d={areaPath} fill="url(#v2-area-gradient)" />
              <path d={linePath} className="v2-series-halo" />
              <path d={linePath} className="v2-series-line" />

              {level >= 5 && eventPoints.map(({ event, point }, index) => (
                <g className={`v2-event-marker ${level === 5 ? "v2-new-target-svg" : ""}`} key={event.date}>
                  <line x1={xForIndex(point.index)} x2={xForIndex(point.index)} y1={CHART.top + 4} y2={CHART.top + plotHeight} />
                  <circle cx={xForIndex(point.index)} cy={yForPoint(point)} r="12" />
                  <text x={xForIndex(point.index)} y={yForPoint(point) + 4}>{index + 1}</text>
                </g>
              ))}

              {([firstBoundary, secondBoundary] as BoundaryPair).map((boundary, slot) =>
                boundary === null ? null : (
                  <g
                    className="v2-boundary-handle"
                    key={`boundary-${slot}`}
                    onPointerDown={(event) => {
                      if (showReveal) return;
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      markAdjustment(event.timeStamp);
                      activeBoundary.current = slot as 0 | 1;
                    }}
                  >
                    <line x1={xForIndex(boundary)} x2={xForIndex(boundary)} y1={CHART.top} y2={CHART.top + plotHeight} />
                    <circle cx={xForIndex(boundary)} cy={CHART.top + plotHeight / 2} r="18" />
                    <text x={xForIndex(boundary)} y={CHART.top + plotHeight / 2 + 5}>{slot + 1}</text>
                    <rect x={xForIndex(boundary) - 29} y={CHART.top - 3} width="58" height="25" rx="12" />
                    <text className="v2-boundary-label" x={xForIndex(boundary)} y={CHART.top + 14}>分界点 {slot + 1}</text>
                  </g>
                ),
              )}

              {level >= 1 && (
                <g className="v2-axes">
                  <line x1={CHART.left} x2={CHART.left} y1={CHART.top} y2={CHART.top + plotHeight} />
                  <line x1={CHART.left} x2={CHART.left + plotWidth} y1={CHART.top + plotHeight} y2={CHART.top + plotHeight} />
                  <g className={level === 1 || level === 4 ? "v2-new-target-svg" : ""}>
                    {yTicks.map((tick) => (
                      <text key={`y-${tick}`} x={CHART.left - 14} y={CHART.top + (1 - tick) * plotHeight + 4} textAnchor="end">
                        {level >= 4
                          ? formatPrice(curve.source.priceMin + tick * (curve.source.priceMax - curve.source.priceMin))
                          : tick.toFixed(2)}
                      </text>
                    ))}
                    <text className="v2-axis-title" transform={`translate(19 ${CHART.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">
                      {level >= 4 ? "每周平均开盘价（USD）" : "标准化价格"}
                    </text>
                  </g>
                  <g className={level === 1 || level === 3 ? "v2-new-target-svg" : ""}>
                    {xTicks.map((index) => (
                      <text key={`x-${index}`} x={xForIndex(index)} y={CHART.top + plotHeight + 30} textAnchor="middle">
                        {level >= 3
                          ? new Date(`${curve.points[index].date}T00:00:00Z`).getUTCFullYear()
                          : `${Math.round((index / (pointCount - 1)) * 100)}%`}
                      </text>
                    ))}
                    <text className="v2-axis-title" x={CHART.left + plotWidth / 2} y={CHART.height - 10} textAnchor="middle">
                      {level >= 3 ? "真实时间（周）" : "在整段走势中的相对位置"}
                    </text>
                  </g>
                </g>
              )}
            </svg>

            <div className="v2-hover-readout" aria-live="polite">
              {hoverPoint ? (
                <>
                  {level >= 1 && <span>相对位置 {Math.round((hoverPoint.index / (pointCount - 1)) * 100)}%</span>}
                  {level >= 3 && <span>{formatDate(hoverPoint.date)}</span>}
                  {level >= 4
                    ? <strong>{formatPrice(hoverPoint.price)}</strong>
                    : level >= 1
                      ? <strong>标准化价格 {hoverPoint.normalized.toFixed(3)}</strong>
                      : <span>点击这里可放置分界点</span>}
                </>
              ) : (
                <span>{level >= 1 ? "移动指针可查看本步骤允许的信息" : "点击曲线两次，或使用下方滑块放置两个分界点"}</span>
              )}
            </div>
          </div>

          <div className="v2-boundary-controls">
            <div>
              <label htmlFor="v2-boundary-one">分界点 1</label>
              <input
                id="v2-boundary-one"
                type="range"
                min="1"
                max={secondBoundary === null ? pointCount - 2 : secondBoundary - MIN_GAP}
                value={firstBoundary ?? Math.round(pointCount / 3)}
                disabled={showReveal}
                onPointerDown={(event) => markAdjustment(event.timeStamp)}
                onKeyDown={(event) => markAdjustment(event.timeStamp)}
                onChange={(event) => moveBoundary(0, Number(event.target.value))}
              />
              <output>{firstBoundary === null ? "尚未选择" : level >= 3 ? formatDate(curve.points[firstBoundary].date) : `相对位置 ${Math.round((firstBoundary / (pointCount - 1)) * 100)}%`}</output>
            </div>
            <div>
              <label htmlFor="v2-boundary-two">分界点 2</label>
              <input
                id="v2-boundary-two"
                type="range"
                min={firstBoundary === null ? 1 : firstBoundary + MIN_GAP}
                max={pointCount - 2}
                value={secondBoundary ?? Math.round((pointCount * 2) / 3)}
                disabled={showReveal}
                onPointerDown={(event) => markAdjustment(event.timeStamp)}
                onKeyDown={(event) => markAdjustment(event.timeStamp)}
                onChange={(event) => moveBoundary(1, Number(event.target.value))}
              />
              <output>{secondBoundary === null ? "尚未选择" : level >= 3 ? formatDate(curve.points[secondBoundary].date) : `相对位置 ${Math.round((secondBoundary / (pointCount - 1)) * 100)}%`}</output>
            </div>
            <button className="v2-text-button" onClick={resetToPrevious} disabled={showReveal}>
              {level ? "恢复为上一轮位置" : "清空重新选择"}
            </button>
          </div>
        </div>

        <aside className="v2-response-panel">
          <section className="v2-new-info-card">
            <div className="v2-new-info-label"><span>这一步新增的信息</span><small>NEW</small></div>
            <h2>{disclosure.title}</h2>
            <p>{disclosure.newInfo}</p>
            <div><span>暂未显示</span><strong>{disclosure.hidden}</strong></div>
          </section>

          {level === 5 && (
            <section className="v2-marker-note v2-new-target">
              <span className="v2-new-tag">新增</span>
              <strong>图中出现了 6 个编号位置</strong>
              <p>这一轮只显示位置，下一轮才会告诉你对应的事件。</p>
            </section>
          )}

          {level >= 6 && (
            <section className="v2-event-list v2-new-target">
              <span className="v2-new-tag">新增</span>
              {eventPoints.map(({ event }, index) => (
                <div key={event.date}>
                  <span>{index + 1}</span>
                  <p><time>{formatDate(event.date)}</time><strong>{event.label}</strong></p>
                </div>
              ))}
              <small>预测试事件集；正式研究前将独立预注册。</small>
            </section>
          )}

          <section className="v2-response-card">
            <fieldset>
              <legend>你对这次划分有多大信心？</legend>
              <div className="v2-number-scale">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={confidence === value ? "selected" : ""}
                    onClick={() => setConfidence(value)}
                  >{value}</button>
                ))}
              </div>
              <div className="v2-scale-labels"><span>很不确定</span><span>非常确定</span></div>
            </fieldset>

            {level > 0 && (
              <fieldset>
                <legend>这一步新增的信息，对你的判断影响有多大？</legend>
                <div className="v2-influence-scale">
                  {[0, 1, 2, 3, 4].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={influenceRating === value ? "selected" : ""}
                      onClick={() => setInfluenceRating(value)}
                    >{value}</button>
                  ))}
                </div>
                <div className="v2-scale-labels"><span>没有影响</span><span>影响很大</span></div>
              </fieldset>
            )}

            <fieldset>
              <legend>这次判断主要参考了什么？ <small>可多选</small></legend>
              <div className="v2-cue-chips">
                {availableCues.map((cue) => (
                  <button
                    type="button"
                    key={cue}
                    className={cueTags.includes(cue) ? "selected" : ""}
                    onClick={() => toggleCue(cue)}
                  >{cue}</button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="v2-rationale">还想补充什么？ <span>可不填</span></label>
            <textarea
              id="v2-rationale"
              value={rationale}
              maxLength={500}
              placeholder="例如：这里开始由持续上涨转为高位震荡……"
              onChange={(event) => setRationale(event.target.value)}
            />
            <div className="v2-char-count">{rationale.length}/500</div>

            {error && <p className="v2-error" role="alert">{error}</p>}
            <button className="v2-primary" disabled={!canSubmit} onClick={submitDecision}>
              {busy
                ? "正在保存…"
                : level === DISCLOSURES.length - 1
                  ? curvePosition === orderedCurves.length - 1
                    ? "提交最后一次判断"
                    : "完成这条走势"
                  : "提交本轮，查看下一项信息"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="v2-submit-note">提交后将进入下一步，不能返回修改本轮答案。</p>
          </section>
        </aside>
      </section>

      {showReveal && (
        <div className="v2-reveal-backdrop" role="presentation">
          <section className="v2-reveal-dialog" role="dialog" aria-modal="true" aria-labelledby="v2-reveal-title">
            <div className="v2-reveal-step"><span>{curvePosition + 1}</span> / 4 条走势 · <span>{level + 1}</span> / 7 步</div>
            <p className="v2-kicker">{level === 0 ? "开始一条新的匿名走势" : "请留意这一步新增的信息"}</p>
            <h2 id="v2-reveal-title">{disclosure.title}</h2>
            <p>{disclosure.newInfo}</p>
            <div className="v2-reveal-rule"><span>本轮任务不变</span><strong>仍然使用两个分界点，划分三个阶段</strong></div>
            <button className="v2-primary" onClick={acknowledgeReveal}>
              我已看到，开始判断 <span aria-hidden="true">→</span>
            </button>
          </section>
        </div>
      )}
    </main>
  );
}

function EffectMatrix({ curves, decisions }: { curves: Curve[]; decisions: Decision[] }) {
  return (
    <div className="v2-effect-matrix">
      <div className="v2-matrix-header"><span>币种</span>{DISCLOSURES.slice(1).map((item) => <span key={item.key}>{item.short}</span>)}</div>
      {curves.map((curve) => {
        const rows = decisions.filter((decision) => decision.curveId === curve.id);
        return (
          <div className="v2-matrix-row" key={curve.id}>
            <strong>{curve.asset.symbol}<small>{curve.asset.nameZh}</small></strong>
            {rows.slice(1).map((decision, index) => {
              const value = layerElasticity(decision, rows[index]);
              return (
                <div key={decision.disclosureKey} title={`${value.toFixed(3)}`}>
                  <i style={{ width: `${Math.min(100, value * 650)}%` }} />
                  <span>{value.toFixed(3)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function BoundaryTrajectoryV2({ decisions }: { decisions: Decision[] }) {
  const width = 900;
  const height = 390;
  const left = 120;
  const right = 32;
  const top = 34;
  const bottom = 46;
  const x = (ratio: number) => left + ratio * (width - left - right);
  const y = (index: number) => top + (index / Math.max(decisions.length - 1, 1)) * (height - top - bottom);
  const first = decisions.map((decision, index) => `${index ? "L" : "M"}${x(decision.boundary1Ratio)},${y(index)}`).join(" ");
  const second = decisions.map((decision, index) => `${index ? "L" : "M"}${x(decision.boundary2Ratio)},${y(index)}`).join(" ");

  return (
    <div className="v2-trajectory-wrap">
      <div className="v2-trajectory-legend"><span className="one">分界点 1</span><span className="two">分界点 2</span></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="两个分界点随七步信息增加而移动的轨迹">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}><line className="grid" x1={x(ratio)} x2={x(ratio)} y1={top} y2={height - bottom} /><text x={x(ratio)} y={height - 15} textAnchor="middle">{Math.round(ratio * 100)}%</text></g>
        ))}
        {decisions.map((decision, index) => (
          <g key={decision.disclosureKey}><line className="row" x1={left} x2={width - right} y1={y(index)} y2={y(index)} /><text x={left - 14} y={y(index) + 5} textAnchor="end">{DISCLOSURES[index].short}</text></g>
        ))}
        <path className="boundary-one" d={first} />
        <path className="boundary-two" d={second} />
        {decisions.map((decision, index) => (
          <g key={`dots-${decision.disclosureKey}`}><circle className="dot-one" cx={x(decision.boundary1Ratio)} cy={y(index)} r="6" /><circle className="dot-two" cx={x(decision.boundary2Ratio)} cy={y(index)} r="6" /></g>
        ))}
      </svg>
      <p>左侧是曲线开始，右侧是曲线结束；线向右表示分界点被移到了更晚的位置。</p>
    </div>
  );
}

function DecisionReview({ curve, decisions }: { curve: Curve; decisions: Decision[] }) {
  return (
    <div className="v2-review-table-wrap">
      <table className="v2-review-table">
        <thead><tr><th>步骤</th><th>分界点 1</th><th>分界点 2</th><th>比上一轮移动</th><th>信心</th><th>主观影响</th></tr></thead>
        <tbody>
          {decisions.map((decision, index) => {
            const movement = index ? layerElasticity(decision, decisions[index - 1]) : null;
            return (
              <tr key={decision.disclosureKey}>
                <td><strong>{DISCLOSURES[index].short}</strong><small>{DISCLOSURES[index].title}</small></td>
                <td>{formatDate(decision.boundary1Date)}</td>
                <td>{formatDate(decision.boundary2Date)}</td>
                <td>{movement === null ? "基线" : movement.toFixed(3)}</td>
                <td>{decision.confidence}/5</td>
                <td>{index ? `${decision.influenceRating}/4` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>回顾表中的日期仅在实验结束后显示；早期步骤作答时并不可见。当前币种：{curve.asset.nameZh}（{curve.asset.symbol}）。</p>
    </div>
  );
}
