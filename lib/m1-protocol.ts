export const M1_PROTOCOL_VERSION = "m1-isomorphic-v1";
export const M1_STIMULUS_BUNDLE = "/data/research-stimuli-modular-v8.json";
export const M1_STIMULUS_SHA256 = "c941b59446774c62e848f5fc3431d555a05ab07e6ec416b489c4bc98d014074e";
export const M1_EVENT_SOURCE_SHA256 = "cc9d1f5d06fa2aeb447c57abeb1c42c560195967d33e7a4f90629333c3bc9438";
export const M1_AGENT_PROMPT_PATH = "/data/m1-agent-system-prompt-v1.txt";
export const M1_AGENT_PROMPT_SHA256 = "9bb751053f6adab759323983c9358089fdf0906ef9217ef7627cd94586974647";
export const M1_COHORT_ID = "m1-technical-pilot-a2-2026";
export const M1_STUDY_PHASE = "technical-pilot";
export const M1_PREREGISTRATION_VERSION = "m1-pilot-prereg-v2";
export const M1_ANALYSIS_SET_VERSION = "m1-pilot-analysis-v2";
export const M1_IMPLEMENTATION_BUILD_ID = "m1-stage-a2-742fc2b137cc2510";

export const M1_ASSET_IDS = [
  "bitcoin",
  "ethereum",
  "solana",
  "bnb",
  "xrp",
  "dogecoin",
] as const;

export const M1_DISCLOSURE_KEYS = [
  "G0",
  "GI1",
  "GI2",
  "DI1",
  "DI2",
  "DI3",
  "DI4",
] as const;

export type M1Condition = "staged" | "repeat-control";

export type M1ProtocolTrial = {
  id: string;
  order: number;
  module: "disclosure";
  taskType: "T2";
  assetId: (typeof M1_ASSET_IDS)[number];
  metric: "price";
  resolution: "weekly";
  scaleMode: "linear";
  windowMode: "whole";
  disclosures: Array<(typeof M1_DISCLOSURE_KEYS)[number]>;
  variantLabel: string;
};

// Six-sequence Williams design for an even number of conditions. Rotating the
// base row balances position and immediate carry-over across paired sessions.
const WILLIAMS_ORDERS = [
  [0, 1, 5, 2, 4, 3],
  [1, 2, 0, 3, 5, 4],
  [2, 3, 1, 4, 0, 5],
  [3, 4, 2, 5, 1, 0],
  [4, 5, 3, 0, 2, 1],
  [5, 0, 4, 1, 3, 2],
] as const;

export function normalizeM1ScheduleId(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= WILLIAMS_ORDERS.length
    ? parsed
    : 1;
}

export function normalizeM1Condition(value: unknown): M1Condition {
  return value === "repeat-control" ? "repeat-control" : "staged";
}

export function scheduleIdFromText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % WILLIAMS_ORDERS.length + 1;
}

export function buildM1ProtocolPlan(
  scheduleId: number,
  condition: M1Condition,
): M1ProtocolTrial[] {
  const normalizedSchedule = normalizeM1ScheduleId(scheduleId);
  const order = WILLIAMS_ORDERS[normalizedSchedule - 1];
  const disclosures = condition === "repeat-control"
    ? M1_DISCLOSURE_KEYS.map(() => "G0" as const)
    : [...M1_DISCLOSURE_KEYS];

  return order.map((assetIndex, trialOrder) => ({
    id: `m1-s${String(normalizedSchedule).padStart(2, "0")}-t${String(trialOrder + 1).padStart(2, "0")}`,
    order: trialOrder,
    module: "disclosure",
    taskType: "T2",
    assetId: M1_ASSET_IDS[assetIndex],
    metric: "price",
    resolution: "weekly",
    scaleMode: "linear",
    windowMode: "whole",
    disclosures: [...disclosures],
    variantLabel: `曲线 ${trialOrder + 1}`,
  }));
}

export function m1StepOrder(trialOrder: number, disclosureIndex: number) {
  return disclosureIndex * M1_ASSET_IDS.length + trialOrder;
}

export function isStrictM1Arm(value: unknown) {
  return value === "m1-main" || value === "agent-m1-main" || value === "pilot-m1";
}

export function sameM1Plan(
  candidate: unknown,
  canonical: M1ProtocolTrial[],
) {
  if (!Array.isArray(candidate) || candidate.length !== canonical.length) return false;
  return canonical.every((expected, index) => {
    const actual = candidate[index];
    if (!actual || typeof actual !== "object") return false;
    const row = actual as Record<string, unknown>;
    return row.id === expected.id &&
      row.order === expected.order &&
      row.module === expected.module &&
      row.taskType === expected.taskType &&
      row.assetId === expected.assetId &&
      row.metric === expected.metric &&
      row.resolution === expected.resolution &&
      row.scaleMode === expected.scaleMode &&
      row.windowMode === expected.windowMode &&
      Array.isArray(row.disclosures) &&
      row.disclosures.length === expected.disclosures.length &&
      row.disclosures.every((key, disclosureIndex) => key === expected.disclosures[disclosureIndex]);
  });
}
