import { ensureGoSchema, getD1 } from "@/db";
import { apiMessage, cleanNickname, createAccessCode, hashAccessCode, requireGoLearner } from "../goAuth";

type ProfilePayload = {
  action?: "create" | "load" | "rename";
  nickname?: string;
  learnerId?: string;
  accessCode?: string;
};

async function loadProgress(learnerId: string) {
  const rows = await getD1()
    .prepare(`SELECT level, best_score AS bestScore, attempts, stars,
      completed_at AS completedAt, last_attempt_at AS lastAttemptAt
      FROM go_progress WHERE learner_id = ? ORDER BY level`)
    .bind(learnerId)
    .all<{
      level: number;
      bestScore: number;
      attempts: number;
      stars: number;
      completedAt: string | null;
      lastAttemptAt: string;
    }>();
  return rows.results;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ProfilePayload;
    const action = payload.action ?? "load";
    if (action === "create") {
      const nickname = cleanNickname(payload.nickname);
      if (nickname.length < 1) {
        return Response.json({ error: "请输入 1—20 个字符的昵称" }, { status: 400 });
      }
      await ensureGoSchema();
      const learnerId = crypto.randomUUID();
      const accessCode = createAccessCode();
      const accessCodeHash = await hashAccessCode(accessCode);
      await getD1()
        .prepare("INSERT INTO go_learners (id, nickname, access_code_hash) VALUES (?, ?, ?)")
        .bind(learnerId, nickname, accessCodeHash)
        .run();
      return Response.json({
        learner: { id: learnerId, nickname, accessCode, createdAt: new Date().toISOString() },
        progress: [],
      }, { status: 201 });
    }

    const learner = await requireGoLearner({
      learnerId: payload.learnerId ?? "",
      accessCode: payload.accessCode ?? "",
    });
    let nickname = learner.nickname;
    if (action === "rename") {
      nickname = cleanNickname(payload.nickname);
      if (!nickname) return Response.json({ error: "昵称不能为空" }, { status: 400 });
      await getD1().prepare("UPDATE go_learners SET nickname = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(nickname, learner.id).run();
    } else {
      await getD1().prepare("UPDATE go_learners SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(learner.id).run();
    }
    return Response.json({
      learner: {
        id: learner.id,
        nickname,
        accessCode: payload.accessCode,
        createdAt: learner.createdAt,
      },
      progress: await loadProgress(learner.id),
    });
  } catch (error) {
    return Response.json({ error: apiMessage(error) }, { status: 401 });
  }
}
