import { ensureGoSchema, getD1 } from "@/db";
import { apiMessage, requireGoLearner } from "../goAuth";

type RecordPayload = {
  action?: "attempt" | "game";
  learnerId?: string;
  accessCode?: string;
  level?: number;
  mode?: "quiz" | "retry";
  score?: number;
  total?: number;
  durationMs?: number;
  answers?: unknown;
  opponentId?: string;
  boardSize?: number;
  result?: string;
  scoreData?: unknown;
  moveCount?: number;
};

function integer(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : fallback;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RecordPayload;
    const learner = await requireGoLearner({
      learnerId: payload.learnerId ?? "",
      accessCode: payload.accessCode ?? "",
    });
    await ensureGoSchema();
    const d1 = getD1();

    if (payload.action === "game") {
      const opponentId = typeof payload.opponentId === "string" ? payload.opponentId.slice(0, 30) : "normal";
      const boardSize = integer(payload.boardSize, 9);
      const result = typeof payload.result === "string" ? payload.result.slice(0, 40) : "unfinished";
      if (![9, 13, 19].includes(boardSize)) {
        return Response.json({ error: "不支持的棋盘大小" }, { status: 400 });
      }
      const scoreJson = JSON.stringify(payload.scoreData ?? {});
      const gameId = crypto.randomUUID();
      await d1.batch([
        d1.prepare(`INSERT INTO go_games
          (id, learner_id, opponent_id, board_size, result, score_json, move_count, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(gameId, learner.id, opponentId, boardSize, result, scoreJson.slice(0, 6000), Math.max(0, integer(payload.moveCount)), Math.max(0, integer(payload.durationMs))),
        d1.prepare("UPDATE go_learners SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(learner.id),
      ]);
      return Response.json({ ok: true, gameId }, { status: 201 });
    }

    const level = integer(payload.level);
    const total = Math.max(1, Math.min(10, integer(payload.total, 10)));
    const score = Math.max(0, Math.min(total, integer(payload.score)));
    if (level < 1 || level > 10) {
      return Response.json({ error: "围棋级别无效" }, { status: 400 });
    }
    const answersJson = JSON.stringify(payload.answers ?? []);
    if (answersJson.length > 20000) {
      return Response.json({ error: "答题记录过长" }, { status: 400 });
    }
    const percent = Math.round((score / total) * 100);
    const stars = percent >= 90 ? 3 : percent >= 80 ? 2 : percent >= 60 ? 1 : 0;
    const attemptId = crypto.randomUUID();
    const certificateId = `TIM-GO-${String(level).padStart(2, "0")}-${attemptId.slice(0, 8).toUpperCase()}`;
    await d1.batch([
      d1.prepare(`INSERT INTO go_attempts
        (id, learner_id, level, mode, score, total, duration_ms, answers_json, certificate_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          attemptId,
          learner.id,
          level,
          payload.mode === "retry" ? "retry" : "quiz",
          score,
          total,
          Math.max(0, integer(payload.durationMs)),
          answersJson,
          certificateId,
        ),
      d1.prepare(`INSERT INTO go_progress
        (learner_id, level, best_score, attempts, stars, completed_at, last_attempt_at)
        VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(learner_id, level) DO UPDATE SET
          best_score = MAX(go_progress.best_score, excluded.best_score),
          attempts = go_progress.attempts + 1,
          stars = MAX(go_progress.stars, excluded.stars),
          completed_at = COALESCE(go_progress.completed_at, CURRENT_TIMESTAMP),
          last_attempt_at = CURRENT_TIMESTAMP`)
        .bind(learner.id, level, percent, stars),
      d1.prepare("UPDATE go_learners SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(learner.id),
    ]);
    const progress = await d1.prepare(`SELECT level, best_score AS bestScore, attempts, stars,
      completed_at AS completedAt, last_attempt_at AS lastAttemptAt
      FROM go_progress WHERE learner_id = ? AND level = ?`)
      .bind(learner.id, level)
      .first<{
        level: number;
        bestScore: number;
        attempts: number;
        stars: number;
        completedAt: string | null;
        lastAttemptAt: string;
      }>();
    return Response.json({
      ok: true,
      attemptId,
      certificateId,
      progress,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: apiMessage(error) }, { status: 401 });
  }
}
