import type { XiangqiBoardState, XiangqiPoint } from "./xiangqiEngine";
import { sameXiangqiPoint, xiangqiPieceText } from "./xiangqiEngine";

type XiangqiBoardProps = {
  board: XiangqiBoardState;
  selected: XiangqiPoint | null;
  legalTargets: XiangqiPoint[];
  lastMove: { from: XiangqiPoint; to: XiangqiPoint } | null;
  disabled?: boolean;
  onPoint: (point: XiangqiPoint) => void;
};

export function XiangqiBoard({ board, selected, legalTargets, lastMove, disabled = false, onPoint }: XiangqiBoardProps) {
  return (
    <div className="xq-board" role="group" aria-label="中国象棋棋盘，红方在下">
      <svg className="xq-board-lines" viewBox="0 0 9 10" aria-hidden="true">
        {Array.from({ length: 10 }, (_, row) => <line key={`h-${row}`} x1=".5" y1={row + .5} x2="8.5" y2={row + .5} />)}
        {Array.from({ length: 9 }, (_, col) => (
          <g key={`v-${col}`}>
            {col === 0 || col === 8
              ? <line x1={col + .5} y1=".5" x2={col + .5} y2="9.5" />
              : <>
                  <line x1={col + .5} y1=".5" x2={col + .5} y2="4.5" />
                  <line x1={col + .5} y1="5.5" x2={col + .5} y2="9.5" />
                </>}
          </g>
        ))}
        <line x1="3.5" y1=".5" x2="5.5" y2="2.5" />
        <line x1="5.5" y1=".5" x2="3.5" y2="2.5" />
        <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" />
        <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" />
      </svg>
      <div className="xq-river" aria-hidden="true"><span>楚 河</span><span>漢 界</span></div>
      <div className="xq-points">
        {board.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
          const point = { row: rowIndex, col: colIndex };
          const isSelected = sameXiangqiPoint(selected, point);
          const isLegal = legalTargets.some((target) => sameXiangqiPoint(target, point));
          const isLastFrom = sameXiangqiPoint(lastMove?.from, point);
          const isLastTo = sameXiangqiPoint(lastMove?.to, point);
          const classes = [
            "xq-point",
            piece ? `has-piece is-${piece.side}` : "",
            isSelected ? "is-selected" : "",
            isLegal ? "is-legal" : "",
            isLastFrom ? "is-last-from" : "",
            isLastTo ? "is-last-to" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              type="button"
              className={classes}
              key={`${rowIndex}-${colIndex}`}
              onClick={() => onPoint(point)}
              disabled={disabled}
              aria-label={`${String.fromCharCode(65 + colIndex)}${10 - rowIndex}${piece ? `，${piece.side === "red" ? "红" : "黑"}${xiangqiPieceText[piece.side][piece.kind]}` : "，空位"}`}
            >
              {piece && <span className="xq-piece" aria-hidden="true">{xiangqiPieceText[piece.side][piece.kind]}</span>}
              {isLegal && !piece && <i className="xq-legal-dot" aria-hidden="true" />}
              {isLegal && piece && <i className="xq-capture-ring" aria-hidden="true" />}
            </button>
          );
        }))}
      </div>
    </div>
  );
}
