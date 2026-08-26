import { env } from "cloudflare:workers";

type M1CollectionGateName =
  | "M1_STAGE_A_PRIMARY_COLLECTION_ENABLED"
  | "M1_HUMAN_COLLECTION_ENABLED"
  | "M1_DEVELOPMENT_PILOT_ENABLED";

function enabled(name: M1CollectionGateName) {
  return String((env as Cloudflare.Env & Record<M1CollectionGateName, string | undefined>)[name] ?? "")
    .trim()
    .toLowerCase() === "true";
}

export type M1CollectionGateFailure = {
  code:
    | "M1_STAGE_A_PRIMARY_COLLECTION_DISABLED"
    | "M1_HUMAN_COLLECTION_DISABLED"
    | "M1_DEVELOPMENT_PILOT_DISABLED"
    | "M1_DEPLOYMENT_IDENTITY_NOT_CONFIGURED"
    | "M1_DEPLOYMENT_MISMATCH"
    | "M1_ALLOCATION_MODE_INVALID"
    | "M1_COLLECTION_MODE_CONFLICT";
  error: string;
};

export function m1CollectionGateFailure(
  experimentalArm: string,
  allocationMode?: unknown,
): M1CollectionGateFailure | null {
  // Quota-manual is a diagnostic/development allocation even when it reuses
  // the strict /m1 or /agent route. It must never inherit production gates.
  if (allocationMode === "quota-manual") {
    if (enabled("M1_STAGE_A_PRIMARY_COLLECTION_ENABLED") || enabled("M1_HUMAN_COLLECTION_ENABLED")) {
      return {
        code: "M1_COLLECTION_MODE_CONFLICT",
        error: "Development diagnostics cannot run while formal collection gates are enabled",
      };
    }
    return enabled("M1_DEVELOPMENT_PILOT_ENABLED")
      ? null
      : { code: "M1_DEVELOPMENT_PILOT_DISABLED", error: "Development pilot collection is disabled" };
  }
  if (
    (experimentalArm === "m1-main" || experimentalArm === "agent-m1-main") &&
    enabled("M1_DEVELOPMENT_PILOT_ENABLED")
  ) return {
    code: "M1_COLLECTION_MODE_CONFLICT",
    error: "Formal collection cannot run while the development-pilot gate is enabled",
  };
  if (
    (experimentalArm === "m1-main" || experimentalArm === "agent-m1-main") &&
    !enabled("M1_STAGE_A_PRIMARY_COLLECTION_ENABLED")
  ) return { code: "M1_STAGE_A_PRIMARY_COLLECTION_DISABLED", error: "Stage-A primary collection is disabled" };
  if (experimentalArm === "m1-main" && !enabled("M1_HUMAN_COLLECTION_ENABLED")) {
    return { code: "M1_HUMAN_COLLECTION_DISABLED", error: "Human research collection is disabled" };
  }
  if (experimentalArm === "pilot-m1") {
    if (enabled("M1_STAGE_A_PRIMARY_COLLECTION_ENABLED") || enabled("M1_HUMAN_COLLECTION_ENABLED")) {
      return {
        code: "M1_COLLECTION_MODE_CONFLICT",
        error: "Development diagnostics cannot run while formal collection gates are enabled",
      };
    }
    if (!enabled("M1_DEVELOPMENT_PILOT_ENABLED")) {
      return { code: "M1_DEVELOPMENT_PILOT_DISABLED", error: "Development pilot collection is disabled" };
    }
  }
  return null;
}

export function m1CollectionGateResponse(experimentalArm: string, allocationMode?: unknown) {
  const failure = m1CollectionGateFailure(experimentalArm, allocationMode);
  return failure ? Response.json(failure, { status: 503 }) : null;
}

export function m1DeploymentIdentity() {
  const deploymentId = String((env as Cloudflare.Env & { M1_DEPLOYMENT_ID?: string }).M1_DEPLOYMENT_ID ?? "").trim();
  const deploymentFingerprintSha256 = String(
    (env as Cloudflare.Env & { M1_DEPLOYMENT_FINGERPRINT_SHA256?: string }).M1_DEPLOYMENT_FINGERPRINT_SHA256 ?? "",
  ).trim().toLowerCase();
  return {
    deploymentId,
    deploymentFingerprintSha256,
    valid: /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(deploymentId) && /^[a-f0-9]{64}$/.test(deploymentFingerprintSha256),
  };
}

export function m1SessionMutationGateFailure(
  experimentalArm: string,
  studyConfig: Record<string, unknown>,
): M1CollectionGateFailure | null {
  const allocationMode = studyConfig.allocationMode;
  const collectionFailure = m1CollectionGateFailure(experimentalArm, allocationMode);
  if (collectionFailure) return collectionFailure;
  if (experimentalArm !== "m1-main" && experimentalArm !== "agent-m1-main") return null;
  if (allocationMode === "quota-manual") return null;
  if (allocationMode !== "balanced-random-v1") {
    return { code: "M1_ALLOCATION_MODE_INVALID", error: "Frozen M1 allocation mode is invalid" };
  }
  const identity = m1DeploymentIdentity();
  if (!identity.valid) {
    return {
      code: "M1_DEPLOYMENT_IDENTITY_NOT_CONFIGURED",
      error: "The M1 deployment identity is not frozen",
    };
  }
  if (
    studyConfig.deploymentId !== identity.deploymentId ||
    studyConfig.deploymentFingerprintSha256 !== identity.deploymentFingerprintSha256
  ) {
    return {
      code: "M1_DEPLOYMENT_MISMATCH",
      error: "This M1 session belongs to a different frozen deployment",
    };
  }
  return null;
}

export function m1SessionMutationGateResponse(
  experimentalArm: string,
  studyConfig: Record<string, unknown>,
) {
  const failure = m1SessionMutationGateFailure(experimentalArm, studyConfig);
  if (!failure) return null;
  const status = failure.code === "M1_DEPLOYMENT_MISMATCH" || failure.code === "M1_ALLOCATION_MODE_INVALID"
    ? 409
    : 503;
  return Response.json(failure, { status });
}
