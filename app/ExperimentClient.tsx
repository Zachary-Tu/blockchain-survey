"use client";

import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
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
};

type Stimulus = {
  id: string;
  protocolVersion: string;
  asset: { name: string; symbol: string; currency: string };
  source: {
    project: string;
    frozenCohortCount: number;
    currentRuleValidCount: number;
    rawTsvCount: number;
    aggregation: string;
    window: { start: string; end: string };
  };
  points: PricePoint[];
  events: MarketEvent[];
};

type BoundaryPair = [number | null, number | null];

type Decision = {
  disclosureLevel: number;
  disclosureKey: string;
  boundary1Index: number;
  boundary2Index: number;
  boundary1Ratio: number;
  boundary2Ratio: number;
  boundary1Date: string;
  boundary2Date: string;
  confidence: number;
  rationale: string;
  elapsedMs: number;
};

const DISCLOSURES = [
  {
    key: "shape",
    short: "形态",
    title: "只观察曲线形态",
    unlocked: "一条未命名时间序列",
    hidden: "坐标、资产、日期、价格与事件",
    prompt: "仅凭曲线形态，选择两个位置，把序列划分为三个阶段。",
  },
  {
    key: "coordinates",
    short: "坐标",
    title: "披露坐标结构",
    unlocked: "周序号与标准化价格",
    hidden: "资产、真实日期、价格单位与事件",
    prompt: "坐标结构已经披露。请保留或修改你的阶段边界。",
  },
  {
    key: "identity",
    short: "身份",
    title: "披露资产身份",
    unlocked: "Bitcoin（BTC）",
    hidden: "真实日期、USD 价格与事件",
    prompt: "现在你知道资产身份。请根据新增信息重新判断。",
  },
  {
    key: "dates",
    short: "日期",
    title: "披露真实日期",
    unlocked: "2017–2024 的时间刻度",
    hidden: "USD 价格与事件",
    prompt: "真实时间已经披露。边界可以保持，也可以移动。",
  },
  {
    key: "prices",
    short: "价格",
    title: "披露真实价格",
    unlocked: "每周平均开盘价与 USD 纵轴",
    hidden: "历史事件",
    prompt: "真实价格已经披露。请再次确认三个阶段。",
  },
  {
    key: "events",
    short: "事件",
    title: "披露候选历史事件",
    unlocked: "中性措辞的历史事件标记",
    hidden: "无",
    prompt: "最后一次判断：事件信息是否改变了你看到的阶段？",
  },
] as const;

const CHART = { width: 1000, height: 480, left: 78, right: 28, top: 32, bottom: 66 };
const MIN_GAP = 8;
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

function nearestEventPoint(points: PricePoint[], eventDate: string) {
  const target = new Date(`${eventDate}T00:00:00Z`).getTime();
  return points.reduce((best, point) => {
    const distance = Math.abs(new Date(`${point.date}T00:00:00Z`).getTime() - target);
    return distance < best.distance ? { point, distance } : best;
  }, { point: points[0], distance: Number.POSITIVE_INFINITY }).point;
}

export function ExperimentClient() {
  const [stimulus, setStimulus] = useState<Stimulus | null>(null);
  const [screen, setScreen] = useState<"welcome" | "experiment" | "complete">("welcome");
  const [sessionId, setSessionId] = useState("");
  const [participantCode, setParticipantCode] = useState("");
  const [expertise, setExpertise] = useState("none");
  const [consented, setConsented] = useState(false);
  const [level, setLevel] = useState(0);
  const [boundaries, setBoundaries] = useState<BoundaryPair>([null, null]);
  const [confidence, setConfidence] = useState(3);
  const [rationale, setRationale] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);
  const activeBoundary = useRef<0 | 1 | null>(null);
  const roundStartedAt = useRef<number | null>(null);

  useEffect(() => {
    fetch("/data/bitcoin-2017-2024.json")
      .then((response) => {
        if (!response.ok) throw new Error("实验曲线加载失败");
        return response.json() as Promise<Stimulus>;
      })
      .then(setStimulus)
      .catch((cause: Error) => setError(cause.message));
  }, []);

  const pointCount = stimulus?.points.length ?? 0;
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const disclosure = DISCLOSURES[level];

  const xForIndex = (index: number) =>
    CHART.left + (index / Math.max(pointCount - 1, 1)) * plotWidth;
  const yForPoint = (point: PricePoint) =>
    CHART.top + (1 - point.normalized) * plotHeight;

  const linePath = useMemo(() => {
    if (!stimulus) return "";
    return stimulus.points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xForIndex(index).toFixed(2)},${yForPoint(point).toFixed(2)}`)
      .join(" ");
  // xForIndex and yForPoint are deterministic for the loaded stimulus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stimulus, pointCount]);

  const areaPath = linePath
    ? `${linePath} L${xForIndex(pointCount - 1)},${CHART.top + plotHeight} L${CHART.left},${CHART.top + plotHeight} Z`
    : "";

  const eventPoints = useMemo(
    () =>
      stimulus?.events.map((event) => ({
        event,
        point: nearestEventPoint(stimulus.points, event.date),
      })) ?? [],
    [stimulus],
  );

  const hoverPoint = hoverIndex === null ? null : stimulus?.points[hoverIndex] ?? null;
  const previousDecision = level > 0 ? decisions[level - 1] : null;

  function clientXToIndex(clientX: number) {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || !pointCount) return 0;
    const svgX = ((clientX - rect.left) / rect.width) * CHART.width;
    const ratio = clamp((svgX - CHART.left) / plotWidth, 0, 1);
    return Math.round(ratio * (pointCount - 1));
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
      const slot: 0 | 1 = Math.abs(nextIndex - first) <= Math.abs(nextIndex - second) ? 0 : 1;
      if (slot === 0) return [clamp(nextIndex, 1, second - MIN_GAP), second];
      return [first, clamp(nextIndex, first + MIN_GAP, pointCount - 2)];
    });
  }

  function handleChartPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (!stimulus) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    placeBoundary(clientXToIndex(event.clientX));
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (!stimulus) return;
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

  async function startExperiment() {
    if (!stimulus || !consented) return;
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
          experimentalArm: "trajectory",
          protocolVersion: stimulus.protocolVersion,
        }),
      });
      const result = (await response.json()) as { session?: { id: string }; error?: string };
      if (!response.ok || !result.session) throw new Error(result.error ?? "无法建立匿名实验会话");
      setSessionId(result.session.id);
      setScreen("experiment");
      roundStartedAt.current = Date.now();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法开始实验");
    } finally {
      setBusy(false);
    }
  }

  async function submitDecision() {
    if (!stimulus || !sessionId || boundaries[0] === null || boundaries[1] === null) return;
    const [boundary1Index, boundary2Index] = boundaries as [number, number];
    const submittedAt = Date.now();
    const elapsedMs = roundStartedAt.current === null ? 0 : submittedAt - roundStartedAt.current;
    const decision: Decision = {
      disclosureLevel: level,
      disclosureKey: disclosure.key,
      boundary1Index,
      boundary2Index,
      boundary1Ratio: boundary1Index / (pointCount - 1),
      boundary2Ratio: boundary2Index / (pointCount - 1),
      boundary1Date: stimulus.points[boundary1Index].date,
      boundary2Date: stimulus.points[boundary2Index].date,
      confidence,
      rationale: rationale.trim(),
      elapsedMs,
    };

    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, curveId: stimulus.id, ...decision }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "本轮记录失败");
      const nextDecisions = [...decisions, decision];
      setDecisions(nextDecisions);

      if (level === DISCLOSURES.length - 1) {
        await fetch("/api/sessions", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        setScreen("complete");
      } else {
        setLevel((current) => current + 1);
        setConfidence(3);
        setRationale("");
        setHoverIndex(null);
        roundStartedAt.current = Date.now();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "本轮记录失败");
    } finally {
      setBusy(false);
    }
  }

  function resetToPrevious() {
    if (!previousDecision) {
      setBoundaries([null, null]);
      return;
    }
    setBoundaries([previousDecision.boundary1Index, previousDecision.boundary2Index]);
  }

  function downloadSession() {
    if (!stimulus) return;
    const payload = {
      sessionId,
      protocolVersion: stimulus.protocolVersion,
      curveId: stimulus.id,
      expertise,
      decisions,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boundary-session-${sessionId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (screen === "welcome") {
    return (
      <main className="welcome-shell">
        <header className="brandbar">
          <div className="brandmark" aria-hidden="true"><span /><span /></div>
          <div>
            <p className="brandname">BOUNDARY LAB</p>
            <p className="brandtag">Context Elasticity Study · Pilot v1</p>
          </div>
          <span className="prototype-pill">研究原型</span>
        </header>

        <section className="welcome-grid">
          <div className="hero-copy">
            <p className="eyebrow">同一条曲线，不同的语义世界</p>
            <h1>你在哪里看到<br />市场阶段的边界？</h1>
            <p className="hero-lead">
              你将把同一条价格曲线划分为三个阶段。我们会逐步披露更多信息，观察你的判断是否、以及如何改变。
            </p>

            <div className="protocol-strip" aria-label="六轮信息披露">
              {DISCLOSURES.map((item, index) => (
                <div className="protocol-node" key={item.key}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{item.short}</strong>
                </div>
              ))}
            </div>

            <div className="dataset-facts">
              <div><strong>678</strong><span>冻结区块链曲线母库</span></div>
              <div><strong>2</strong><span>边界定义三个阶段</span></div>
              <div><strong>6</strong><span>累积信息披露轮次</span></div>
            </div>
          </div>

          <aside className="onboarding-card">
            <p className="card-kicker">开始匿名实验</p>
            <h2>约 5 分钟完成</h2>
            <p className="muted">
              原型不收集姓名、邮箱、钱包地址或交易金额。匿名代码仅用于测试时区分会话，可以留空。
            </p>

            <label className="field-label" htmlFor="participant-code">匿名代码（可选）</label>
            <input
              id="participant-code"
              className="text-input"
              value={participantCode}
              maxLength={64}
              placeholder="例如 P-017"
              onChange={(event) => setParticipantCode(event.target.value)}
            />

            <label className="field-label" htmlFor="expertise">你对加密资产的经验</label>
            <select
              id="expertise"
              className="text-input"
              value={expertise}
              onChange={(event) => setExpertise(event.target.value)}
            >
              <option value="none">没有相关经验</option>
              <option value="casual">偶尔关注</option>
              <option value="active">主动交易或研究</option>
              <option value="professional">专业工作相关</option>
            </select>

            <label className="consent-row">
              <input
                type="checkbox"
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
              />
              <span>我理解这是匿名研究原型，并同意记录每轮切点、信心、简短理由与作答时间。</span>
            </label>

            {error && <p className="error-banner" role="alert">{error}</p>}
            <button
              className="primary-button"
              disabled={!consented || !stimulus || busy}
              onClick={startExperiment}
            >
              {busy ? "正在建立会话…" : stimulus ? "开始划分阶段" : "正在载入曲线…"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="microcopy">本页为方法与界面试运行，正式招募前仍需伦理审批。</p>
          </aside>
        </section>
      </main>
    );
  }

  if (screen === "complete" && stimulus) {
    return (
      <main className="complete-shell">
        <header className="brandbar compact">
          <div className="brandmark" aria-hidden="true"><span /><span /></div>
          <div><p className="brandname">BOUNDARY LAB</p><p className="brandtag">匿名会话已完成</p></div>
          <span className="session-chip">{sessionId.slice(0, 8)}</span>
        </header>

        <section className="complete-hero">
          <p className="eyebrow">六轮判断已保存</p>
          <h1>你的边界如何随信息移动</h1>
          <p>以下只展示你的判断轨迹，不提供“正确答案”。市场阶段本身可以存在合理分歧。</p>
        </section>

        <section className="summary-grid">
          <BoundaryTrajectory decisions={decisions} />
          <div className="elasticity-card">
            <p className="card-kicker">个人结果</p>
            <h2>总上下文弹性</h2>
            <strong className="big-number">
              {decisions.slice(1).reduce((sum, decision, index) => {
                const previous = decisions[index];
                return sum +
                  (Math.abs(decision.boundary1Ratio - previous.boundary1Ratio) +
                    Math.abs(decision.boundary2Ratio - previous.boundary2Ratio)) /
                    2;
              }, 0).toFixed(3)}
            </strong>
            <p className="muted">六层披露中两个边界平均标准化移动的累计值。</p>
            <button className="secondary-button" onClick={downloadSession}>下载本会话 JSON</button>
          </div>
        </section>

        <section className="decision-table-card">
          <div className="section-heading">
            <div><p className="card-kicker">ROUND LOG</p><h2>逐轮信息与边界</h2></div>
            <p>日期仅用于结果回顾；早期轮次作答时并不可见。</p>
          </div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>轮次</th><th>披露信息</th><th>边界 1</th><th>边界 2</th><th>相对上一轮</th><th>信心</th></tr></thead>
              <tbody>
                {decisions.map((decision, index) => {
                  const previous = index ? decisions[index - 1] : null;
                  const elasticity = previous
                    ? (Math.abs(decision.boundary1Ratio - previous.boundary1Ratio) +
                        Math.abs(decision.boundary2Ratio - previous.boundary2Ratio)) /
                      2
                    : null;
                  return (
                    <tr key={decision.disclosureKey}>
                      <td>{String(index + 1).padStart(2, "0")}</td>
                      <td>{DISCLOSURES[index].title}</td>
                      <td>{formatDate(decision.boundary1Date)}</td>
                      <td>{formatDate(decision.boundary2Date)}</td>
                      <td>{elasticity === null ? "基线" : elasticity.toFixed(3)}</td>
                      <td>{decision.confidence}/5</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  }

  if (!stimulus) return <main className="loading-state">正在载入实验曲线…</main>;

  const [firstBoundary, secondBoundary] = boundaries;
  const hasBoth = firstBoundary !== null && secondBoundary !== null;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) =>
    Math.round(ratio * (pointCount - 1)),
  );
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <main className="experiment-shell">
      <header className="experiment-header">
        <div className="brandline">
          <div className="brandmark small" aria-hidden="true"><span /><span /></div>
          <div><p className="brandname">BOUNDARY LAB</p><p className="brandtag">匿名阶段划分实验</p></div>
        </div>
        <div className="stepper" aria-label={`第 ${level + 1} 轮，共 ${DISCLOSURES.length} 轮`}>
          {DISCLOSURES.map((item, index) => (
            <div className={`step ${index < level ? "done" : index === level ? "active" : ""}`} key={item.key}>
              <span>{index < level ? "✓" : index + 1}</span>
              <small>{item.short}</small>
            </div>
          ))}
        </div>
        <span className="session-chip">{sessionId.slice(0, 8)}</span>
      </header>

      <section className="experiment-layout">
        <div className="chart-card">
          <div className="chart-heading">
            <div>
              <p className="round-label">ROUND {String(level + 1).padStart(2, "0")} / 06</p>
              <h1>{level >= 2 ? `${stimulus.asset.name} · ${stimulus.asset.symbol}` : "序列 A-017"}</h1>
              <p>{disclosure.prompt}</p>
            </div>
            <div className="chart-status">
              <span className={hasBoth ? "ready" : "waiting"}>{hasBoth ? "两个边界已就位" : `还需选择 ${2 - boundaries.filter((value) => value !== null).length} 个边界`}</span>
              <small>{pointCount} 个周观察点</small>
            </div>
          </div>

          <div className="chart-wrap">
            <svg
              ref={chartRef}
              className="price-chart"
              viewBox={`0 0 ${CHART.width} ${CHART.height}`}
              role="img"
              aria-label="交互式价格曲线。点击两次添加边界，或拖动现有边界。"
              onPointerDown={handleChartPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onPointerLeave={() => activeBoundary.current === null && setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#287a69" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#287a69" stopOpacity="0" />
                </linearGradient>
              </defs>

              {level >= 1 && yTicks.map((tick) => {
                const y = CHART.top + (1 - tick) * plotHeight;
                return <line className="gridline" key={`y-${tick}`} x1={CHART.left} x2={CHART.left + plotWidth} y1={y} y2={y} />;
              })}

              {hasBoth && (
                <g className="stage-regions">
                  <rect x={CHART.left} y={CHART.top} width={xForIndex(firstBoundary) - CHART.left} height={plotHeight} className="stage-one" />
                  <rect x={xForIndex(firstBoundary)} y={CHART.top} width={xForIndex(secondBoundary) - xForIndex(firstBoundary)} height={plotHeight} className="stage-two" />
                  <rect x={xForIndex(secondBoundary)} y={CHART.top} width={CHART.left + plotWidth - xForIndex(secondBoundary)} height={plotHeight} className="stage-three" />
                  <text x={(CHART.left + xForIndex(firstBoundary)) / 2} y={CHART.top + 22}>阶段 1</text>
                  <text x={(xForIndex(firstBoundary) + xForIndex(secondBoundary)) / 2} y={CHART.top + 22}>阶段 2</text>
                  <text x={(xForIndex(secondBoundary) + CHART.left + plotWidth) / 2} y={CHART.top + 22}>阶段 3</text>
                </g>
              )}

              <path d={areaPath} fill="url(#areaGradient)" />
              <path d={linePath} className="series-line-halo" />
              <path d={linePath} className="series-line" />

              {level >= 5 && eventPoints.map(({ event, point }, index) => {
                const x = xForIndex(point.index);
                const y = yForPoint(point);
                return (
                  <g className="event-marker" key={event.date}>
                    <line x1={x} x2={x} y1={CHART.top + 5} y2={CHART.top + plotHeight} />
                    <circle cx={x} cy={y} r="12" />
                    <text x={x} y={y + 4}>{index + 1}</text>
                  </g>
                );
              })}

              {([firstBoundary, secondBoundary] as BoundaryPair).map((boundary, slot) =>
                boundary === null ? null : (
                  <g
                    className="boundary-handle"
                    key={`boundary-${slot}`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      activeBoundary.current = slot as 0 | 1;
                    }}
                  >
                    <line x1={xForIndex(boundary)} x2={xForIndex(boundary)} y1={CHART.top} y2={CHART.top + plotHeight} />
                    <circle cx={xForIndex(boundary)} cy={CHART.top + plotHeight / 2} r="18" />
                    <text x={xForIndex(boundary)} y={CHART.top + plotHeight / 2 + 5}>{slot + 1}</text>
                    <rect x={xForIndex(boundary) - 28} y={CHART.top - 2} width="56" height="24" rx="12" />
                    <text className="boundary-label" x={xForIndex(boundary)} y={CHART.top + 14}>边界 {slot + 1}</text>
                  </g>
                ),
              )}

              {level >= 1 && (
                <g className="axes">
                  <line x1={CHART.left} x2={CHART.left} y1={CHART.top} y2={CHART.top + plotHeight} />
                  <line x1={CHART.left} x2={CHART.left + plotWidth} y1={CHART.top + plotHeight} y2={CHART.top + plotHeight} />
                  {yTicks.map((tick) => (
                    <text key={`yl-${tick}`} x={CHART.left - 14} y={CHART.top + (1 - tick) * plotHeight + 4} textAnchor="end">
                      {level >= 4 ? usd.format(tick * Math.max(...stimulus.points.map((point) => point.price))) : tick.toFixed(2)}
                    </text>
                  ))}
                  {xTicks.map((index) => (
                    <text key={`xl-${index}`} x={xForIndex(index)} y={CHART.top + plotHeight + 30} textAnchor="middle">
                      {level >= 3 ? new Date(`${stimulus.points[index].date}T00:00:00Z`).getUTCFullYear() : index + 1}
                    </text>
                  ))}
                  <text className="axis-title" x={CHART.left + plotWidth / 2} y={CHART.height - 8} textAnchor="middle">
                    {level >= 3 ? "真实时间（周）" : "观察序号（周）"}
                  </text>
                  <text className="axis-title" transform={`translate(18 ${CHART.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">
                    {level >= 4 ? "每周平均开盘价（USD）" : "标准化价格"}
                  </text>
                </g>
              )}
            </svg>

            <div className="hover-readout" aria-live="polite">
              {hoverPoint ? (
                <>
                  <span>观察点 {hoverPoint.index + 1}</span>
                  {level >= 3 && <span>{formatDate(hoverPoint.date)}</span>}
                  {level >= 4 && <strong>{usd.format(hoverPoint.price)}</strong>}
                  {level === 1 || level === 2 ? <strong>标准化 {hoverPoint.normalized.toFixed(3)}</strong> : null}
                </>
              ) : (
                <span>将指针移到曲线上查看当前层级允许的信息</span>
              )}
            </div>
          </div>

          <div className="boundary-controls">
            <div>
              <label htmlFor="boundary-one">边界 1</label>
              <input
                id="boundary-one"
                type="range"
                min="1"
                max={secondBoundary === null ? pointCount - 2 : secondBoundary - MIN_GAP}
                value={firstBoundary ?? Math.round(pointCount / 3)}
                disabled={firstBoundary === null}
                onChange={(event) => moveBoundary(0, Number(event.target.value))}
              />
              <output>{firstBoundary === null ? "尚未选择" : level >= 3 ? formatDate(stimulus.points[firstBoundary].date) : `观察点 ${firstBoundary + 1}`}</output>
            </div>
            <div>
              <label htmlFor="boundary-two">边界 2</label>
              <input
                id="boundary-two"
                type="range"
                min={firstBoundary === null ? 1 : firstBoundary + MIN_GAP}
                max={pointCount - 2}
                value={secondBoundary ?? Math.round((pointCount * 2) / 3)}
                disabled={secondBoundary === null}
                onChange={(event) => moveBoundary(1, Number(event.target.value))}
              />
              <output>{secondBoundary === null ? "尚未选择" : level >= 3 ? formatDate(stimulus.points[secondBoundary].date) : `观察点 ${secondBoundary + 1}`}</output>
            </div>
            <button className="text-button" onClick={resetToPrevious}>{level ? "恢复上一轮" : "重新选择"}</button>
          </div>
        </div>

        <aside className="decision-panel">
          <div className="disclosure-card">
            <p className="card-kicker">本轮新信息</p>
            <h2>{disclosure.title}</h2>
            <div className="info-row"><span>已披露</span><strong>{disclosure.unlocked}</strong></div>
            <div className="info-row muted-row"><span>仍隐藏</span><strong>{disclosure.hidden}</strong></div>
          </div>

          {level >= 5 && (
            <div className="event-list">
              {eventPoints.map(({ event }, index) => (
                <div key={event.date}><span>{index + 1}</span><p><strong>{formatDate(event.date)}</strong>{event.label}</p></div>
              ))}
            </div>
          )}

          <div className="response-card">
            <label className="field-label" htmlFor="confidence">你对本轮划分有多大信心？</label>
            <div className="confidence-scale">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  className={confidence === value ? "selected" : ""}
                  onClick={() => setConfidence(value)}
                  aria-label={`信心 ${value}，满分 5`}
                >{value}</button>
              ))}
            </div>
            <div className="confidence-labels"><span>很不确定</span><span>非常确定</span></div>

            <label className="field-label" htmlFor="rationale">简短理由（可选）</label>
            <textarea
              id="rationale"
              value={rationale}
              maxLength={800}
              placeholder="例如：趋势方向改变、波动明显增大、事件附近出现转折……"
              onChange={(event) => setRationale(event.target.value)}
            />
            <p className="character-count">{rationale.length}/800</p>

            {error && <p className="error-banner" role="alert">{error}</p>}
            <button className="primary-button" disabled={!hasBoth || busy} onClick={submitDecision}>
              {busy ? "正在保存…" : level === DISCLOSURES.length - 1 ? "提交最终判断" : "保存并披露下一层"}
              <span aria-hidden="true">→</span>
            </button>
            <p className="microcopy">提交后不能返回上一层；保持边界不动也是有效判断。</p>
          </div>
        </aside>
      </section>
    </main>
  );
}

function BoundaryTrajectory({ decisions }: { decisions: Decision[] }) {
  const width = 760;
  const height = 300;
  const left = 54;
  const right = 24;
  const top = 28;
  const bottom = 48;
  const x = (index: number) => left + (index / Math.max(decisions.length - 1, 1)) * (width - left - right);
  const y = (ratio: number) => top + ratio * (height - top - bottom);
  const first = decisions.map((decision, index) => `${index ? "L" : "M"}${x(index)},${y(decision.boundary1Ratio)}`).join(" ");
  const second = decisions.map((decision, index) => `${index ? "L" : "M"}${x(index)},${y(decision.boundary2Ratio)}`).join(" ");

  return (
    <div className="trajectory-card">
      <div className="section-heading">
        <div><p className="card-kicker">BOUNDARY TRAJECTORY</p><h2>标准化边界位置</h2></div>
        <div className="legend"><span className="legend-one">边界 1</span><span className="legend-two">边界 2</span></div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="两个阶段边界随六轮信息披露的移动轨迹">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}><line x1={left} x2={width - right} y1={y(ratio)} y2={y(ratio)} /><text x={left - 12} y={y(ratio) + 4} textAnchor="end">{ratio.toFixed(2)}</text></g>
        ))}
        <path className="trajectory-one" d={first} />
        <path className="trajectory-two" d={second} />
        {decisions.map((decision, index) => (
          <g key={decision.disclosureKey}>
            <circle className="trajectory-dot-one" cx={x(index)} cy={y(decision.boundary1Ratio)} r="6" />
            <circle className="trajectory-dot-two" cx={x(index)} cy={y(decision.boundary2Ratio)} r="6" />
            <text className="trajectory-x-label" x={x(index)} y={height - 16} textAnchor="middle">{DISCLOSURES[index].short}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
