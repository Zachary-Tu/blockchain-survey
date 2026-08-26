import {
  M1_COHORT_ID,
  M1_EVENT_SOURCE_SHA256,
  M1_IMPLEMENTATION_BUILD_ID,
  M1_PROTOCOL_VERSION,
  M1_STIMULUS_SHA256,
} from "./m1-protocol";
import {
  M1_PRESTART_TERMINAL_DISPOSITIONS,
  isM1PreStartTerminalDisposition,
  type M1PreStartTerminalDisposition,
} from "./m1-launch";

export const M1_STAGE_A_THRESHOLDS = {
  expectedPairs: 12,
  expectedSchedules: 6,
  expectedConditions: ["staged", "repeat-control"] as const,
  minimumCompleteMatchedPairs: 10,
  minimumCompleteMatchedPairsPerCondition: 5,
  minimumActorCompletionRate: 0.8,
  maximumAgentControllerAbortRate: 0.1,
  maximumMedianCompletionMinutes: 45,
  maximumP95CompletionMinutes: 75,
  maximumActorDeviationRate: 0.1,
  maximumG0DefaultAnchorRate: 0.5,
} as const;

export const M1_STAGE_A_FROZEN_SCOPE = {
  cohortId: M1_COHORT_ID,
  protocolArchitecture: M1_PROTOCOL_VERSION,
  implementationBuildId: M1_IMPLEMENTATION_BUILD_ID,
  stimulusSha256: M1_STIMULUS_SHA256,
  eventSourceSha256: M1_EVENT_SOURCE_SHA256,
} as const;

export type M1StageAActor = "human" | "agent";
export type M1StageACondition = "staged" | "repeat-control";
export type M1StageASessionStatus = "active" | "complete" | "aborted";

export type M1StageAFrozenScope = {
  cohortId: string;
  protocolArchitecture: string;
  implementationBuildId: string;
  stimulusSha256: string;
  eventSourceSha256: string;
};

export type M1StageAInputManifest = {
  allocationsSha256: string;
  sessionsSha256: string;
  responsesSha256: string;
  stepExposuresSha256: string;
  agentAttemptsSha256: string;
  exportBundleSha256: string;
  externalEvidenceSha256: string;
  verified: boolean;
};

export type M1StageASessionAuditInput = {
  actor: M1StageAActor;
  status: M1StageASessionStatus;
  /** Conventional wall-clock minutes; mandatory for complete sessions. */
  completionMinutes: number | null;
  /** Derived from canonical response/exposure/attempt/link/hash rows, never hand-entered. */
  integrityComplete: boolean;
  /** True when the session or any saved response has a frozen protocol deviation. */
  hasProtocolDeviation: boolean;
  g0JudgmentCount: number;
  g0ExactDefaultAnchorCount: number;
};

export type M1StageAPreStartTerminalInput = {
  disposition: M1PreStartTerminalDisposition;
  /** Server-recorded allocation terminal time; no experiment session exists. */
  terminalAt: string;
};

export type M1StageAPairAuditInput = {
  pairId: string;
  condition: M1StageACondition;
  scheduleId: number;
  human: M1StageASessionAuditInput | null;
  agent: M1StageASessionAuditInput | null;
  humanPreStartTerminal: M1StageAPreStartTerminalInput | null;
  agentPreStartTerminal: M1StageAPreStartTerminalInput | null;
};

export type M1StageAExternalGates = {
  stageACollectionClosed: boolean;
  inputExportBundleHashVerified: boolean;
  eventSourceArchiveVerified: boolean;
  ethicsDecisionArchived: boolean;
  approvedConsentAndDataPlanArchived: boolean;
  humanScreeningProtocolArchived: boolean;
  deploymentManifestArchived: boolean;
  withdrawalExclusionProcessVerified: boolean;
  rawUaMinimizationAuditArchived: boolean;
  dataLossAuditArchived: boolean;
  futureDisclosureAuditArchived: boolean;
  executableControllerArchived: boolean;
  runtimePromptPackageArchived: boolean;
  frozenModelAndApiArchived: boolean;
  frozenBrowserRuntimeArchived: boolean;
  runArtifactManifestHashLinked: boolean;
  externalEvidenceBundleHashVerified: boolean;
};

const M1_STAGE_A_EXTERNAL_GATE_KEYS = [
  "stageACollectionClosed",
  "inputExportBundleHashVerified",
  "eventSourceArchiveVerified",
  "ethicsDecisionArchived",
  "approvedConsentAndDataPlanArchived",
  "humanScreeningProtocolArchived",
  "deploymentManifestArchived",
  "withdrawalExclusionProcessVerified",
  "rawUaMinimizationAuditArchived",
  "dataLossAuditArchived",
  "futureDisclosureAuditArchived",
  "executableControllerArchived",
  "runtimePromptPackageArchived",
  "frozenModelAndApiArchived",
  "frozenBrowserRuntimeArchived",
  "runArtifactManifestHashLinked",
  "externalEvidenceBundleHashVerified",
] as const satisfies ReadonlyArray<keyof M1StageAExternalGates>;

export type M1StageAManualStopChecks = {
  confirmedDataLossCount: number | null;
  confirmedDataLossAuditSha256: string | null;
  futureDisclosureLeakageCount: number | null;
  futureDisclosureAuditSha256: string | null;
};

export type M1StageADecision =
  | "NOT_EVALUABLE"
  | "STOP"
  | "REVISE"
  | "GO_PENDING_EXTERNAL_GATES"
  | "GO";

export type M1StageAAuditResult = {
  decision: M1StageADecision;
  frozenScopeVerified: boolean;
  inputManifestVerified: boolean;
  allocationCoverageComplete: boolean;
  allPrimarySlotsTerminal: boolean;
  completeMatchedPairs: number;
  completeMatchedPairsByCondition: Record<M1StageACondition, number>;
  preStartTerminalSummary: Record<M1StageAActor, {
    total: number;
    byDisposition: Record<M1PreStartTerminalDisposition, number>;
  }>;
  actorSummary: Record<M1StageAActor, {
    started: number;
    complete: number;
    completionRate: number | null;
    controllerAborts: number;
    controllerAbortRate: number | null;
    medianCompletionMinutes: number | null;
    p95CompletionMinutes: number | null;
    sessionsWithDeviation: number;
    deviationRate: number | null;
    g0Judgments: number;
    g0ExactDefaultAnchors: number;
    g0ExactDefaultAnchorRate: number | null;
  }>;
  inputValidationReasons: string[];
  stopReasons: string[];
  reviseReasons: string[];
  pendingExternalGates: Array<keyof M1StageAExternalGates>;
};

const SHA256 = /^[a-f0-9]{64}$/i;

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function conventionalMedian(values: number[]) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function nearestRankPercentile(values: number[], probability: number) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(probability * ordered.length) - 1)];
}

function expectedCells() {
  return new Set(
    M1_STAGE_A_THRESHOLDS.expectedConditions.flatMap((condition) =>
      Array.from(
        { length: M1_STAGE_A_THRESHOLDS.expectedSchedules },
        (_, index) => `${condition}:${index + 1}`,
      ),
    ),
  );
}

function actorSummary(
  pairs: M1StageAPairAuditInput[],
  actor: M1StageAActor,
): M1StageAAuditResult["actorSummary"][M1StageAActor] {
  const sessions = pairs
    .map((pair) => pair[actor])
    .filter((session): session is M1StageASessionAuditInput => session !== null);
  const complete = sessions.filter((session) => session.status === "complete");
  const durations = complete.map((session) => session.completionMinutes as number);
  const controllerAborts = actor === "agent"
    ? sessions.filter((session) => session.status === "aborted").length
    : 0;
  const sessionsWithDeviation = sessions.filter((session) => session.hasProtocolDeviation).length;
  const g0Judgments = sessions.reduce((sum, session) => sum + session.g0JudgmentCount, 0);
  const g0ExactDefaultAnchors = sessions.reduce(
    (sum, session) => sum + session.g0ExactDefaultAnchorCount,
    0,
  );

  return {
    started: sessions.length,
    complete: complete.length,
    completionRate: safeRate(complete.length, sessions.length),
    controllerAborts,
    controllerAbortRate: actor === "agent" ? safeRate(controllerAborts, sessions.length) : null,
    medianCompletionMinutes: conventionalMedian(durations),
    p95CompletionMinutes: nearestRankPercentile(durations, 0.95),
    sessionsWithDeviation,
    deviationRate: safeRate(sessionsWithDeviation, sessions.length),
    g0Judgments,
    g0ExactDefaultAnchors,
    g0ExactDefaultAnchorRate: safeRate(g0ExactDefaultAnchors, g0Judgments),
  };
}

function preStartTerminalSummary(
  pairs: M1StageAPairAuditInput[],
  actor: M1StageAActor,
): M1StageAAuditResult["preStartTerminalSummary"][M1StageAActor] {
  const byDisposition = Object.fromEntries(
    M1_PRESTART_TERMINAL_DISPOSITIONS.map((disposition) => [disposition, 0]),
  ) as Record<M1PreStartTerminalDisposition, number>;
  let total = 0;
  for (const pair of pairs) {
    const terminal = actor === "human"
      ? pair.humanPreStartTerminal
      : pair.agentPreStartTerminal;
    if (!terminal) continue;
    total += 1;
    byDisposition[terminal.disposition] += 1;
  }
  return { total, byDisposition };
}

function validateSession(
  pairId: string,
  slotActor: M1StageAActor,
  session: unknown,
) {
  if (session === null) return [];
  const reasons: string[] = [];
  if (typeof session !== "object" || Array.isArray(session)) {
    return [`invalid-session-object:${pairId}:${slotActor}`];
  }
  const candidate = session as Partial<M1StageASessionAuditInput>;
  if (candidate.actor !== slotActor) reasons.push(`actor-slot-mismatch:${pairId}:${slotActor}`);
  if (typeof candidate.status !== "string" || !["active", "complete", "aborted"].includes(candidate.status)) {
    reasons.push(`invalid-session-status:${pairId}:${slotActor}`);
  }
  if (typeof candidate.integrityComplete !== "boolean") {
    reasons.push(`missing-integrity-result:${pairId}:${slotActor}`);
  }
  if (typeof candidate.hasProtocolDeviation !== "boolean") {
    reasons.push(`missing-deviation-result:${pairId}:${slotActor}`);
  }
  if (
    !Number.isInteger(candidate.g0JudgmentCount) ||
    Number(candidate.g0JudgmentCount) < 0 ||
    Number(candidate.g0JudgmentCount) > 6 ||
    !Number.isInteger(candidate.g0ExactDefaultAnchorCount) ||
    Number(candidate.g0ExactDefaultAnchorCount) < 0 ||
    Number(candidate.g0ExactDefaultAnchorCount) > Number(candidate.g0JudgmentCount)
  ) reasons.push(`invalid-g0-counts:${pairId}:${slotActor}`);
  if (candidate.status === "complete") {
    if (
      typeof candidate.completionMinutes !== "number" ||
      !Number.isFinite(candidate.completionMinutes) ||
      candidate.completionMinutes < 0
    ) reasons.push(`complete-duration-missing:${pairId}:${slotActor}`);
    if (candidate.g0JudgmentCount !== 6) reasons.push(`complete-g0-count-not-six:${pairId}:${slotActor}`);
  } else if (
    candidate.completionMinutes !== null &&
    (typeof candidate.completionMinutes !== "number" ||
      !Number.isFinite(candidate.completionMinutes) ||
      candidate.completionMinutes < 0)
  ) reasons.push(`invalid-noncomplete-duration:${pairId}:${slotActor}`);
  return reasons;
}

function validatePreStartTerminal(
  pairId: string,
  slotActor: M1StageAActor,
  terminal: unknown,
) {
  if (terminal === null) return [];
  if (typeof terminal !== "object" || Array.isArray(terminal)) {
    return [`invalid-prestart-terminal-object:${pairId}:${slotActor}`];
  }
  const candidate = terminal as Partial<M1StageAPreStartTerminalInput>;
  const reasons: string[] = [];
  if (!isM1PreStartTerminalDisposition(candidate.disposition)) {
    reasons.push(`invalid-prestart-terminal-disposition:${pairId}:${slotActor}`);
  }
  if (
    typeof candidate.terminalAt !== "string" ||
    !candidate.terminalAt ||
    !Number.isFinite(Date.parse(candidate.terminalAt))
  ) reasons.push(`invalid-prestart-terminal-time:${pairId}:${slotActor}`);
  return reasons;
}

function scopeMatchesFrozen(scope: M1StageAFrozenScope) {
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) return false;
  return Object.entries(M1_STAGE_A_FROZEN_SCOPE).every(
    ([key, expected]) => scope[key as keyof M1StageAFrozenScope] === expected,
  );
}

function manifestIsVerified(manifest: M1StageAInputManifest) {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) return false;
  return manifest.verified === true && [
    manifest.allocationsSha256,
    manifest.sessionsSha256,
    manifest.responsesSha256,
    manifest.stepExposuresSha256,
    manifest.agentAttemptsSha256,
    manifest.exportBundleSha256,
    manifest.externalEvidenceSha256,
  ].every((hash) => SHA256.test(hash));
}

/** Applies the frozen Stage-A rules to summaries derived from verified exports. */
export function auditM1StageA(args: {
  scope: M1StageAFrozenScope;
  inputManifest: M1StageAInputManifest;
  pairs: M1StageAPairAuditInput[];
  manualStopChecks: M1StageAManualStopChecks;
  externalGates: M1StageAExternalGates;
}): M1StageAAuditResult {
  const { scope, inputManifest, pairs, manualStopChecks, externalGates } = args;
  const inputValidationReasons: string[] = [];
  const frozenScopeVerified = scopeMatchesFrozen(scope);
  const inputManifestVerified = manifestIsVerified(inputManifest);
  if (!frozenScopeVerified) inputValidationReasons.push("frozen-scope-mismatch");
  if (!inputManifestVerified) inputValidationReasons.push("input-manifest-unverified");
  const pairRows: M1StageAPairAuditInput[] = [];
  if (!Array.isArray(pairs)) inputValidationReasons.push("pairs-not-array");
  else for (const [index, pair] of pairs.entries()) {
    if (typeof pair !== "object" || pair === null || Array.isArray(pair)) {
      inputValidationReasons.push(`invalid-pair-object:${index}`);
    } else pairRows.push(pair);
  }

  for (const pair of pairRows) {
    if (typeof pair.pairId !== "string" || !pair.pairId.trim()) inputValidationReasons.push("invalid-pair-id");
    if (!M1_STAGE_A_THRESHOLDS.expectedConditions.includes(pair.condition)) {
      inputValidationReasons.push(`invalid-condition:${pair.pairId}`);
    }
    if (!Number.isInteger(pair.scheduleId) || pair.scheduleId < 1 || pair.scheduleId > 6) {
      inputValidationReasons.push(`invalid-schedule:${pair.pairId}`);
    }
    inputValidationReasons.push(...validateSession(pair.pairId, "human", pair.human));
    inputValidationReasons.push(...validateSession(pair.pairId, "agent", pair.agent));
    inputValidationReasons.push(...validatePreStartTerminal(
      pair.pairId,
      "human",
      pair.humanPreStartTerminal,
    ));
    inputValidationReasons.push(...validatePreStartTerminal(
      pair.pairId,
      "agent",
      pair.agentPreStartTerminal,
    ));
    if (pair.human !== null && pair.humanPreStartTerminal !== null) {
      inputValidationReasons.push(`session-prestart-terminal-conflict:${pair.pairId}:human`);
    }
    if (pair.agent !== null && pair.agentPreStartTerminal !== null) {
      inputValidationReasons.push(`session-prestart-terminal-conflict:${pair.pairId}:agent`);
    }
  }
  if (
    manualStopChecks.confirmedDataLossCount !== null &&
    (!Number.isInteger(manualStopChecks.confirmedDataLossCount) || manualStopChecks.confirmedDataLossCount < 0)
  ) inputValidationReasons.push("invalid-confirmed-data-loss-count");
  if (
    manualStopChecks.futureDisclosureLeakageCount !== null &&
    (!Number.isInteger(manualStopChecks.futureDisclosureLeakageCount) || manualStopChecks.futureDisclosureLeakageCount < 0)
  ) inputValidationReasons.push("invalid-future-disclosure-leakage-count");

  const observedCells = pairRows.map((pair) => `${pair.condition}:${pair.scheduleId}`);
  const expected = expectedCells();
  const allocationCoverageComplete =
    pairRows.length === M1_STAGE_A_THRESHOLDS.expectedPairs &&
    new Set(pairRows.map((pair) => pair.pairId)).size === pairRows.length &&
    new Set(observedCells).size === expected.size &&
    observedCells.every((cell) => expected.has(cell));
  const allPrimarySlotsTerminal = pairRows.every((pair) =>
    (
      pair.human?.status === "complete" || pair.human?.status === "aborted" ||
      (pair.human === null && pair.humanPreStartTerminal !== null)
    ) && (
      pair.agent?.status === "complete" || pair.agent?.status === "aborted" ||
      (pair.agent === null && pair.agentPreStartTerminal !== null)
    ),
  );
  const completeMatchedPairs = pairRows.filter((pair) =>
    pair.human?.status === "complete" && pair.agent?.status === "complete",
  ).length;
  const completeMatchedPairsByCondition: Record<M1StageACondition, number> = {
    staged: pairRows.filter((pair) => pair.condition === "staged" && pair.human?.status === "complete" && pair.agent?.status === "complete").length,
    "repeat-control": pairRows.filter((pair) => pair.condition === "repeat-control" && pair.human?.status === "complete" && pair.agent?.status === "complete").length,
  };

  const safePairs = inputValidationReasons.length === 0 ? pairRows : [];
  const actor = { human: actorSummary(safePairs, "human"), agent: actorSummary(safePairs, "agent") };
  const preStartTerminal = {
    human: preStartTerminalSummary(safePairs, "human"),
    agent: preStartTerminalSummary(safePairs, "agent"),
  };
  const stopReasons: string[] = [];
  const reviseReasons: string[] = [];

  if (inputValidationReasons.length === 0) {
    for (const pair of pairRows) {
      for (const session of [pair.human, pair.agent]) {
        if (session?.status === "complete" && !session.integrityComplete) {
          stopReasons.push(`complete-session-integrity-failed:${pair.pairId}:${session.actor}`);
        }
      }
    }
  }
  if ((manualStopChecks.confirmedDataLossCount ?? 0) > 0) stopReasons.push("confirmed-data-loss");
  if ((manualStopChecks.futureDisclosureLeakageCount ?? 0) > 0) stopReasons.push("future-disclosure-leakage");

  if (completeMatchedPairs < M1_STAGE_A_THRESHOLDS.minimumCompleteMatchedPairs) reviseReasons.push("complete-matched-pairs-below-10");
  for (const condition of M1_STAGE_A_THRESHOLDS.expectedConditions) {
    if (completeMatchedPairsByCondition[condition] < M1_STAGE_A_THRESHOLDS.minimumCompleteMatchedPairsPerCondition) {
      reviseReasons.push(`complete-matched-pairs-below-5:${condition}`);
    }
  }
  for (const actorName of ["human", "agent"] as const) {
    const summary = actor[actorName];
    if (summary.completionRate === null || summary.completionRate < M1_STAGE_A_THRESHOLDS.minimumActorCompletionRate) reviseReasons.push(`completion-rate-below-80-percent:${actorName}`);
    if (summary.medianCompletionMinutes === null || summary.medianCompletionMinutes > M1_STAGE_A_THRESHOLDS.maximumMedianCompletionMinutes) reviseReasons.push(`median-completion-above-45-minutes:${actorName}`);
    if (summary.p95CompletionMinutes === null || summary.p95CompletionMinutes > M1_STAGE_A_THRESHOLDS.maximumP95CompletionMinutes) reviseReasons.push(`p95-completion-above-75-minutes:${actorName}`);
    if (summary.deviationRate === null || summary.deviationRate > M1_STAGE_A_THRESHOLDS.maximumActorDeviationRate) reviseReasons.push(`protocol-deviation-rate-above-10-percent:${actorName}`);
    if (summary.g0ExactDefaultAnchorRate === null || summary.g0ExactDefaultAnchorRate > M1_STAGE_A_THRESHOLDS.maximumG0DefaultAnchorRate) reviseReasons.push(`g0-default-anchor-rate-above-50-percent:${actorName}`);
  }
  if (actor.agent.controllerAbortRate === null || actor.agent.controllerAbortRate > M1_STAGE_A_THRESHOLDS.maximumAgentControllerAbortRate) reviseReasons.push("agent-controller-abort-rate-above-10-percent");

  const dataLossAuditVerified = manualStopChecks.confirmedDataLossCount !== null && SHA256.test(manualStopChecks.confirmedDataLossAuditSha256 ?? "");
  const futureDisclosureAuditVerified = manualStopChecks.futureDisclosureLeakageCount !== null && SHA256.test(manualStopChecks.futureDisclosureAuditSha256 ?? "");
  const effectiveExternalGates: M1StageAExternalGates = {
    stageACollectionClosed: externalGates?.stageACollectionClosed === true,
    inputExportBundleHashVerified: externalGates?.inputExportBundleHashVerified === true && inputManifestVerified,
    eventSourceArchiveVerified: externalGates?.eventSourceArchiveVerified === true,
    ethicsDecisionArchived: externalGates?.ethicsDecisionArchived === true,
    approvedConsentAndDataPlanArchived: externalGates?.approvedConsentAndDataPlanArchived === true,
    humanScreeningProtocolArchived: externalGates?.humanScreeningProtocolArchived === true,
    deploymentManifestArchived: externalGates?.deploymentManifestArchived === true,
    withdrawalExclusionProcessVerified: externalGates?.withdrawalExclusionProcessVerified === true,
    rawUaMinimizationAuditArchived: externalGates?.rawUaMinimizationAuditArchived === true,
    dataLossAuditArchived: externalGates?.dataLossAuditArchived === true && dataLossAuditVerified,
    futureDisclosureAuditArchived: externalGates?.futureDisclosureAuditArchived === true && futureDisclosureAuditVerified,
    executableControllerArchived: externalGates?.executableControllerArchived === true,
    runtimePromptPackageArchived: externalGates?.runtimePromptPackageArchived === true,
    frozenModelAndApiArchived: externalGates?.frozenModelAndApiArchived === true,
    frozenBrowserRuntimeArchived: externalGates?.frozenBrowserRuntimeArchived === true,
    runArtifactManifestHashLinked: externalGates?.runArtifactManifestHashLinked === true,
    externalEvidenceBundleHashVerified:
      externalGates?.externalEvidenceBundleHashVerified === true &&
      SHA256.test(inputManifest?.externalEvidenceSha256 ?? ""),
  };
  const pendingExternalGates = M1_STAGE_A_EXTERNAL_GATE_KEYS
    .filter((gate) => !effectiveExternalGates[gate]);

  let decision: M1StageADecision;
  if (stopReasons.length > 0) decision = "STOP";
  else if (
    inputValidationReasons.length > 0 || !allocationCoverageComplete || !allPrimarySlotsTerminal ||
    !effectiveExternalGates.stageACollectionClosed || !effectiveExternalGates.inputExportBundleHashVerified
  ) decision = "NOT_EVALUABLE";
  else if (reviseReasons.length > 0) decision = "REVISE";
  else if (pendingExternalGates.length > 0) decision = "GO_PENDING_EXTERNAL_GATES";
  else decision = "GO";

  return {
    decision,
    frozenScopeVerified,
    inputManifestVerified,
    allocationCoverageComplete,
    allPrimarySlotsTerminal,
    completeMatchedPairs,
    completeMatchedPairsByCondition,
    preStartTerminalSummary: preStartTerminal,
    actorSummary: actor,
    inputValidationReasons,
    stopReasons,
    reviseReasons,
    pendingExternalGates,
  };
}
