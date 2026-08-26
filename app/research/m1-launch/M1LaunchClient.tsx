"use client";

import { useEffect, useState } from "react";
import type { M1Condition } from "@/lib/m1-protocol";

function newPairId() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `M1-${stamp}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export function M1LaunchClient() {
  const [pairId, setPairId] = useState("M1-PENDING");
  const [scheduleId, setScheduleId] = useState(1);
  const [condition, setCondition] = useState<M1Condition>("staged");
  const [allocationMode, setAllocationMode] = useState<"balanced-random-v1" | "quota-manual">("quota-manual");
  const [humanCode, setHumanCode] = useState("H-001");
  const [agentCode, setAgentCode] = useState("A-001");
  const [agentReplicateId, setAgentReplicateId] = useState("R-DIAG-01");
  const [copied, setCopied] = useState("");
  const [links, setLinks] = useState<{ human: string; agent: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const regeneratePair = () => {
    const nextPairId = newPairId();
    setPairId(nextPairId);
    setLinks(null);
    setError("");
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPairId(newPairId());
      setLinks(null);
      setError("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const invalidateLinks = () => {
    setLinks(null);
    setError("");
  };

  const createLinks = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/m1-launches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairId,
          scheduleId,
          informationCondition: condition,
          humanCode,
          agentCode,
          agentReplicateId,
          allocationMode,
        }),
      });
      const payload = await response.json() as { links?: { human: string; agent: string }; scheduleId?: number; informationCondition?: M1Condition; error?: string };
      if (!response.ok || !payload.links) throw new Error(payload.error ?? "安全启动链接生成失败");
      if (payload.scheduleId) setScheduleId(payload.scheduleId);
      if (payload.informationCondition) setCondition(payload.informationCondition);
      setLinks(payload.links);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "安全启动链接生成失败");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (key: "human" | "agent") => {
    if (!links) return;
    await navigator.clipboard.writeText(links[key]);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const copyPair = async () => {
    if (!links) return;
    await navigator.clipboard.writeText(`Human\t${links.human}\nAgent\t${links.agent}`);
    setCopied("pair");
    window.setTimeout(() => setCopied(""), 1600);
  };

  return (
    <section className="mod-m1-launch-console">
      <div className="mod-console-handoff">
        <span>当前用途 · DEVELOPMENT DIAGNOSTIC</span>
        <p>本页默认生成同一 pair 下的 Human 与 Agent 开发测试链接。两侧共享信息条件与 Williams 顺序，但分别建立独立会话；这些记录用于验证流程与数据库，不进入正式 Stage A 样本。</p>
      </div>
      <div className="mod-launch-fields">
        <label><span>Pair ID</span><input value={pairId} maxLength={64} onChange={(event) => { setPairId(event.target.value); invalidateLinks(); }} /></label>
        <label><span>分配模式</span><select value={allocationMode} onChange={(event) => { const nextMode = event.target.value as "balanced-random-v1" | "quota-manual"; setAllocationMode(nextMode); setAgentReplicateId(nextMode === "balanced-random-v1" ? "R-PRIMARY" : "R-DIAG-01"); invalidateLinks(); }}><option value="quota-manual">开发者诊断（当前推荐）</option><option value="balanced-random-v1">正式 Stage A 平衡随机（采集门关闭时不可用）</option></select></label>
        <label><span>Williams schedule</span><select disabled={allocationMode !== "quota-manual"} value={scheduleId} onChange={(event) => { setScheduleId(Number(event.target.value)); invalidateLinks(); }}>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>W{value} · 平衡序列 {value}</option>)}</select></label>
        <label><span>信息条件</span><select disabled={allocationMode !== "quota-manual"} value={condition} onChange={(event) => { setCondition(event.target.value as M1Condition); invalidateLinks(); }}><option value="staged">Staged disclosure（主实验）</option><option value="repeat-control">No-new-information retest（对照）</option></select></label>
        <button type="button" onClick={regeneratePair}>重新生成 Pair ID</button>
        <button type="button" onClick={createLinks} disabled={busy}>{busy ? "正在写入服务端分配…" : "生成两条不透明启动链接"}</button>
        <button type="button" onClick={copyPair} disabled={!links}>{copied === "pair" ? "两条链接已复制" : "复制 Human + Agent 成对链接"}</button>
      </div>
      {error && <p className="mod-error" role="alert">{error}</p>}
      <div className="mod-paired-links">
        <article>
          <span>HUMAN SESSION</span>
          <label>Human 研究编码<input value={humanCode} maxLength={64} onChange={(event) => { setHumanCode(event.target.value); invalidateLinks(); }} /></label>
          <code>{links?.human ?? "尚未生成；链接不会包含 pair、condition、schedule 或研究编码"}</code>
          <div>{links && <a href={links.human} target="_blank" rel="noreferrer">打开 Human 入口</a>}<button type="button" disabled={!links} onClick={() => copy("human")}>{copied === "human" ? "已复制" : "复制链接"}</button></div>
        </article>
        <article>
          <span>AGENT SESSION</span>
          <label>Agent run 编号<input value={agentCode} maxLength={64} onChange={(event) => { setAgentCode(event.target.value); invalidateLinks(); }} /></label>
          <label>Agent replicate ID<input value={agentReplicateId} readOnly={allocationMode === "balanced-random-v1"} maxLength={64} onChange={(event) => { setAgentReplicateId(event.target.value); invalidateLinks(); }} /></label>
          <code>{links?.agent ?? "尚未生成；链接只携带随机 256-bit token"}</code>
          <div>{links && <a href={links.agent} target="_blank" rel="noreferrer">打开 Agent 入口</a>}<button type="button" disabled={!links} onClick={() => copy("agent")}>{copied === "agent" ? "已复制" : "复制链接"}</button></div>
        </article>
      </div>
    </section>
  );
}
