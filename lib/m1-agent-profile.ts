const SHA256 = /^[a-f0-9]{64}$/i;

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function canonicalM1AgentProfile(modelName: unknown, metadata: Record<string, unknown>) {
  return {
    schemaVersion: "m1-agent-profile-v1",
    provider: normalizedString(metadata.provider),
    modelName: normalizedString(modelName),
    modelSnapshot: normalizedString(metadata.modelSnapshot),
    apiVersion: normalizedString(metadata.apiVersion),
    controllerVersion: normalizedString(metadata.controllerVersion),
    controllerArtifactSha256: normalizedString(metadata.controllerArtifactSha256).toLowerCase(),
    runtimePromptPackageSha256: normalizedString(metadata.runtimePromptPackageSha256).toLowerCase(),
    repositorySystemPromptSha256: normalizedString(metadata.promptSha256).toLowerCase(),
    contextPolicy: normalizedString(metadata.contextPolicy),
    inputModality: "screenshot",
    imageDetail: normalizedString(metadata.imageDetail),
    temperature: nullableNumber(metadata.temperature),
    topP: nullableNumber(metadata.topP),
    seed: nullableNumber(metadata.seed),
    reasoningEffort: normalizedString(metadata.reasoningEffort),
    browserEngine: normalizedString(metadata.browserEngine),
    browserMajor: nullableNumber(metadata.browserMajor),
    viewportWidth: 1440,
    viewportHeight: 900,
    devicePixelRatio: 1,
  };
}

export function validM1AgentProfile(profile: ReturnType<typeof canonicalM1AgentProfile>) {
  return Boolean(
    profile.provider &&
    profile.modelName &&
    profile.modelSnapshot &&
    profile.apiVersion &&
    profile.controllerVersion &&
    SHA256.test(profile.controllerArtifactSha256) &&
    SHA256.test(profile.runtimePromptPackageSha256) &&
    SHA256.test(profile.repositorySystemPromptSha256) &&
    profile.contextPolicy === "persistent" &&
    ["high", "auto", "original"].includes(profile.imageDetail) &&
    profile.browserEngine === "Chrome" &&
    Number.isInteger(profile.browserMajor) &&
    Number(profile.browserMajor) >= 100,
  );
}

export async function hashM1AgentProfile(modelName: unknown, metadata: Record<string, unknown>) {
  const canonical = canonicalM1AgentProfile(modelName, metadata);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(canonical)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
