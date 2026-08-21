/// <reference lib="webworker" />

import { searchXiangqiMove } from "./xiangqiSearch";
import type { XiangqiBoardState, XiangqiSide } from "./xiangqiEngine";
import type { XiangqiSearchLevel } from "./xiangqiSearch";

self.onmessage = (event: MessageEvent<{ id: number; board: XiangqiBoardState; side: XiangqiSide; level: XiangqiSearchLevel }>) => {
  const { id, board, side, level } = event.data;
  try {
    self.postMessage({ id, ok: true, result: searchXiangqiMove(board, side, level) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
