import { playMove } from "./goEngine";
import type { GoBoardState, GoColor, GoPoint } from "./goEngine";
import type { GoPuzzleObjective } from "./goTypes";

type Group = { stones: GoPoint[]; liberties: GoPoint[] };

const pointKey = (point: GoPoint) => `${point.row},${point.col}`;

function neighbors(board: GoBoardState, point: GoPoint) {
  return [
    { row: point.row - 1, col: point.col },
    { row: point.row + 1, col: point.col },
    { row: point.row, col: point.col - 1 },
    { row: point.row, col: point.col + 1 },
  ].filter((next) => next.row >= 0 && next.col >= 0 && next.row < board.length && next.col < board.length);
}

export function readGroup(board: GoBoardState, anchor: GoPoint): Group | null {
  const color = board[anchor.row]?.[anchor.col];
  if (color !== 1 && color !== 2) return null;
  const queue = [anchor];
  const seen = new Set([pointKey(anchor)]);
  const stones: GoPoint[] = [];
  const libertyMap = new Map<string, GoPoint>();
  while (queue.length) {
    const point = queue.pop()!;
    stones.push(point);
    for (const next of neighbors(board, point)) {
      if (board[next.row][next.col] === 0) libertyMap.set(pointKey(next), next);
      if (board[next.row][next.col] === color && !seen.has(pointKey(next))) {
        seen.add(pointKey(next));
        queue.push(next);
      }
    }
  }
  return { stones, liberties: [...libertyMap.values()] };
}

function isEye(board: GoBoardState, point: GoPoint, color: GoColor) {
  if (board[point.row]?.[point.col] !== 0) return false;
  const orthogonal = neighbors(board, point);
  if (!orthogonal.length || orthogonal.some((neighbor) => board[neighbor.row][neighbor.col] !== color)) return false;
  const diagonals = [
    { row: point.row - 1, col: point.col - 1 },
    { row: point.row - 1, col: point.col + 1 },
    { row: point.row + 1, col: point.col - 1 },
    { row: point.row + 1, col: point.col + 1 },
  ].filter((next) => next.row >= 0 && next.col >= 0 && next.row < board.length && next.col < board.length);
  const hostileDiagonals = diagonals.filter((diagonal) => board[diagonal.row][diagonal.col] !== color).length;
  return diagonals.length === 4 ? hostileDiagonals <= 1 : hostileDiagonals === 0;
}

function pointsInRegion(objective: GoPuzzleObjective) {
  const points: GoPoint[] = [];
  for (let row = objective.region.top; row <= objective.region.bottom; row += 1) {
    for (let col = objective.region.left; col <= objective.region.right; col += 1) points.push({ row, col });
  }
  return points;
}

export function objectiveAchieved(board: GoBoardState, objective: GoPuzzleObjective) {
  if (objective.kind === "capture-target") {
    return objective.anchors.every((anchor) => board[anchor.row]?.[anchor.col] !== objective.targetColor);
  }
  if (objective.kind === "save-target") {
    const group = objective.anchors
      .map((anchor) => readGroup(board, anchor))
      .find((candidate) => candidate && board[candidate.stones[0].row][candidate.stones[0].col] === objective.targetColor);
    return Boolean(group && group.liberties.length >= (objective.minLiberties ?? 3));
  }
  if (objective.kind === "connect-targets") {
    if (objective.anchors.some((anchor) => board[anchor.row]?.[anchor.col] !== objective.targetColor)) return false;
    const group = readGroup(board, objective.anchors[0]);
    const connected = new Set(group?.stones.map(pointKey));
    return objective.anchors.every((anchor) => connected.has(pointKey(anchor)));
  }
  if (objective.kind === "make-eye") {
    return pointsInRegion(objective).some((point) => isEye(board, point, objective.targetColor));
  }
  return (objective.goalPoints ?? []).some((point) => board[point.row]?.[point.col] === objective.targetColor);
}

function objectiveProgress(board: GoBoardState, objective: GoPuzzleObjective) {
  if (objectiveAchieved(board, objective)) return 10_000;
  if (objective.kind === "capture-target") {
    const remaining = objective.anchors.filter((anchor) => board[anchor.row]?.[anchor.col] === objective.targetColor);
    const liberties = remaining.map((anchor) => readGroup(board, anchor)?.liberties.length ?? 0);
    return (objective.anchors.length - remaining.length) * 200 - Math.min(...liberties, 8) * 12;
  }
  if (objective.kind === "save-target") {
    const group = objective.anchors.map((anchor) => readGroup(board, anchor)).find(Boolean);
    return group ? group.liberties.length * 35 + group.stones.length * 3 : -1_000;
  }
  if (objective.kind === "connect-targets") {
    const groups = objective.anchors.map((anchor) => readGroup(board, anchor));
    if (groups.some((group) => !group)) return -1_000;
    const first = new Set(groups[0]!.stones.map(pointKey));
    return objective.anchors.filter((anchor) => first.has(pointKey(anchor))).length * 80;
  }
  if (objective.kind === "make-eye") {
    return pointsInRegion(objective).reduce((score, point) => {
      if (board[point.row][point.col] !== 0) return score;
      return score + neighbors(board, point).filter((neighbor) => board[neighbor.row][neighbor.col] === objective.targetColor).length * 8;
    }, 0);
  }
  return (objective.goalPoints ?? []).reduce((score, point) => {
    const group = readGroup(board, point);
    return score + (board[point.row]?.[point.col] === 0 ? 10 : 0) + (group?.liberties.length ?? 0);
  }, 0);
}

/**
 * One-ply resistance plus a one-ply learner reply. This is intentionally local:
 * it answers the actual goal and allows several valid winning routes instead of
 * forcing a memorized variation.
 */
export function chooseObjectiveReply(
  board: GoBoardState,
  aiColor: GoColor,
  objective: GoPuzzleObjective,
): GoPoint | null {
  const learnerColor = aiColor === 1 ? 2 : 1;
  const empty = pointsInRegion(objective).filter((point) => board[point.row][point.col] === 0);
  const replies = empty
    .map((point) => ({ point, result: playMove(board, aiColor, point) }))
    .filter((candidate) => candidate.result.valid);
  if (!replies.length) return null;

  let best: { point: GoPoint; danger: number; captureBonus: number } | null = null;
  for (const reply of replies) {
    let danger = objectiveProgress(reply.result.board, objective);
    const learnerReplies = pointsInRegion(objective)
      .filter((point) => reply.result.board[point.row][point.col] === 0)
      .map((point) => playMove(reply.result.board, learnerColor, point))
      .filter((result) => result.valid);
    for (const learnerReply of learnerReplies) {
      danger = Math.max(danger, objectiveProgress(learnerReply.board, objective));
      if (danger >= 10_000) break;
    }
    const candidate = { point: reply.point, danger, captureBonus: reply.result.captured };
    if (!best || candidate.danger < best.danger || (candidate.danger === best.danger && candidate.captureBonus > best.captureBonus)) best = candidate;
  }
  return best?.point ?? null;
}
