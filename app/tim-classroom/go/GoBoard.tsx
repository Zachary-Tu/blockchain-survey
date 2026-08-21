import type { CSSProperties } from "react";

import type { GoBoardState, GoPoint } from "./goEngine";
import { pointLabel } from "./goEngine";

type GoBoardProps = {
  board: GoBoardState;
  onPlay?: (point: GoPoint) => void;
  disabled?: boolean;
  lastMove?: GoPoint | null;
  selectedMove?: GoPoint | null;
  correctMoves?: GoPoint[];
  variation?: GoPoint[];
  label?: string;
  compact?: boolean;
};

function samePoint(left: GoPoint | null | undefined, right: GoPoint) {
  return Boolean(left && left.row === right.row && left.col === right.col);
}

function starPoints(size: number): GoPoint[] {
  if (size === 19) {
    return [3, 9, 15].flatMap((row) => [3, 9, 15].map((col) => ({ row, col })));
  }
  if (size === 13) {
    return [3, 6, 9].flatMap((row) => [3, 6, 9].map((col) => ({ row, col })));
  }
  if (size === 9) return [{ row: 2, col: 2 }, { row: 2, col: 6 }, { row: 4, col: 4 }, { row: 6, col: 2 }, { row: 6, col: 6 }];
  if (size === 7) return [{ row: 2, col: 2 }, { row: 2, col: 4 }, { row: 3, col: 3 }, { row: 4, col: 2 }, { row: 4, col: 4 }];
  return [{ row: Math.floor(size / 2), col: Math.floor(size / 2) }];
}

export function GoBoard({
  board,
  onPlay,
  disabled = false,
  lastMove,
  selectedMove,
  correctMoves = [],
  variation = [],
  label = "围棋棋盘",
  compact = false,
}: GoBoardProps) {
  const size = board.length;
  const stars = starPoints(size);
  const style = { "--go-board-size": size } as CSSProperties;

  return (
    <div className={`go-board ${compact ? "is-compact" : ""}`} style={style} role="group" aria-label={label}>
      <svg className="go-board-lines" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {Array.from({ length: size }, (_, index) => (
          <g key={index}>
            <line x1="0.5" y1={index + 0.5} x2={size - 0.5} y2={index + 0.5} />
            <line x1={index + 0.5} y1="0.5" x2={index + 0.5} y2={size - 0.5} />
          </g>
        ))}
        {stars.map((star) => <circle key={`${star.row}-${star.col}`} cx={star.col + 0.5} cy={star.row + 0.5} r={size >= 13 ? 0.10 : 0.12} />)}
      </svg>
      <div className="go-board-points">
        {board.flatMap((row, rowIndex) => row.map((stone, colIndex) => {
          const point = { row: rowIndex, col: colIndex };
          const correctIndex = correctMoves.findIndex((item) => samePoint(item, point));
          const variationIndex = variation.findIndex((item) => samePoint(item, point));
          const classes = [
            "go-intersection",
            stone === 1 ? "has-black" : stone === 2 ? "has-white" : "",
            samePoint(lastMove, point) ? "is-last" : "",
            samePoint(selectedMove, point) ? "is-selected" : "",
            correctIndex >= 0 ? "is-correct-move" : "",
            variationIndex >= 0 ? "is-variation" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              className={classes}
              type="button"
              key={`${rowIndex}-${colIndex}`}
              onClick={() => onPlay?.(point)}
              disabled={disabled || !onPlay || stone !== 0}
              aria-label={`${pointLabel(point, size)}${stone === 1 ? "，黑棋" : stone === 2 ? "，白棋" : "，空点"}`}
            >
              {stone !== 0 && <span className="go-board-stone" aria-hidden="true" />}
              {correctIndex >= 0 && <i className="go-correct-pulse" aria-hidden="true">✓</i>}
              {variationIndex >= 0 && <i className="go-variation-number" aria-hidden="true">{variationIndex + 1}</i>}
            </button>
          );
        }))}
      </div>
    </div>
  );
}
