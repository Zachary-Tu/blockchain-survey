import { ensureGoSchema, getD1 } from "@/db";

export type GoLearnerAuth = {
  learnerId: string;
  accessCode: string;
};

export function apiMessage(error: unknown) {
  return error instanceof Error ? error.message : "围棋学习记录服务暂时不可用";
}

export function cleanNickname(value: unknown) {
  if (typeof value !== "string") return "";
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 20);
}

export async function hashAccessCode(value: string) {
  const data = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `GO-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export async function requireGoLearner(auth: GoLearnerAuth) {
  const learnerId = typeof auth.learnerId === "string" ? auth.learnerId.trim() : "";
  const accessCode = typeof auth.accessCode === "string" ? auth.accessCode.trim() : "";
  if (!learnerId || !accessCode) throw new Error("学习档案凭证不完整，请重新建立档案");

  await ensureGoSchema();
  const hash = await hashAccessCode(accessCode);
  const learner = await getD1()
    .prepare("SELECT id, nickname, created_at AS createdAt FROM go_learners WHERE id = ? AND access_code_hash = ?")
    .bind(learnerId, hash)
    .first<{ id: string; nickname: string; createdAt: string }>();
  if (!learner) throw new Error("没有找到这份学习档案，请检查学习编号与恢复码");
  return learner;
}
