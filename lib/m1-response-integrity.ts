function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function parseJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export type M1ScientificResponseFingerprintInput = {
  sessionId: string;
  stepOrder: number;
  trialId: string;
  disclosureIndex: number;
  boundariesJson: string;
  previousBoundariesJson: string;
  boundaryIntervalsJson: string;
  influenceRating: number | null;
  noChangeConfirmed: boolean;
  singleStageConfirmed: boolean;
};

export async function hashM1ScientificResponse(input: M1ScientificResponseFingerprintInput) {
  const canonical = canonicalize({
    sessionId: input.sessionId,
    stepOrder: input.stepOrder,
    trialId: input.trialId,
    disclosureIndex: input.disclosureIndex,
    boundaries: parseJson(input.boundariesJson),
    previousBoundaries: parseJson(input.previousBoundariesJson),
    boundaryIntervals: parseJson(input.boundaryIntervalsJson),
    influenceRating: input.influenceRating,
    noChangeConfirmed: input.noChangeConfirmed,
    singleStageConfirmed: input.singleStageConfirmed,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
