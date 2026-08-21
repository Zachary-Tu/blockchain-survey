import { boardToXiangqiFen, uciToXiangqiMove } from "./xiangqiEngine";
import type { XiangqiBoardState, XiangqiMove, XiangqiSide } from "./xiangqiEngine";
import type { XiangqiSearchLevel, XiangqiSearchResult } from "./xiangqiSearch";

export type XiangqiAiResult = {
  move: XiangqiMove | null;
  engine: "fairy-stockfish-nnue" | "local-alpha-beta";
  label: string;
  depth: number;
  nodes: number;
  note: string;
};

let localWorker: Worker | null = null;
let localNextId = 1;
const localPending = new Map<number, { resolve: (result: XiangqiSearchResult) => void; reject: (error: Error) => void; timer: number }>();

function resetLocalWorker(reason = "象棋搜索 Worker 已重启") {
  localWorker?.terminate();
  localWorker = null;
  for (const pending of localPending.values()) {
    window.clearTimeout(pending.timer);
    pending.reject(new Error(reason));
  }
  localPending.clear();
}

function getLocalWorker() {
  if (localWorker) return localWorker;
  const worker = new Worker(new URL("./xiangqiAiWorker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; result?: XiangqiSearchResult; error?: string }>) => {
    const pending = localPending.get(event.data.id);
    if (!pending) return;
    localPending.delete(event.data.id);
    window.clearTimeout(pending.timer);
    if (event.data.ok && event.data.result) pending.resolve(event.data.result);
    else pending.reject(new Error(event.data.error ?? "象棋搜索失败"));
  };
  worker.onerror = () => resetLocalWorker("象棋搜索 Worker 异常");
  localWorker = worker;
  return worker;
}

function requestLocal(board: XiangqiBoardState, side: XiangqiSide, level: XiangqiSearchLevel) {
  return new Promise<XiangqiSearchResult>((resolve, reject) => {
    const id = localNextId++;
    const timeout = level === "immortal" ? 2_600 : level === "woodcutter" ? 1_400 : 700;
    const timer = window.setTimeout(() => {
      localPending.delete(id);
      resetLocalWorker("象棋本地搜索超时");
      reject(new Error("象棋本地搜索超时"));
    }, timeout);
    localPending.set(id, { resolve, reject, timer });
    try {
      getLocalWorker().postMessage({ id, board, side, level });
    } catch (error) {
      window.clearTimeout(timer);
      localPending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

type FairyWaiter = { match: (line: string) => boolean; resolve: (line: string) => void; reject: (error: Error) => void; timer: number };
let fairyWorker: Worker | null = null;
let fairyReady = false;
let fairyInit: Promise<void> | null = null;
let fairySearchInFlight: Promise<XiangqiMove | null> | null = null;
let fairyUnavailableReason: string | null = null;
const fairyWaiters = new Set<FairyWaiter>();

function resetFairy(error = new Error("仙人引擎已重启")) {
  fairyWorker?.terminate();
  fairyWorker = null;
  fairyReady = false;
  fairyInit = null;
  for (const waiter of fairyWaiters) {
    window.clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  fairyWaiters.clear();
}

function fairySupported() {
  return globalThis.crossOriginIsolated && typeof SharedArrayBuffer === "function" && typeof WebAssembly === "object";
}

function getFairyWorker() {
  if (fairyWorker) return fairyWorker;
  const worker = new Worker("/tim-classroom/xiangqi/engine/fairy-host.js");
  worker.onmessage = (event: MessageEvent<{ type: string; line?: string; error?: string }>) => {
    if (event.data.type === "host-error") {
      resetFairy(new Error(event.data.error ?? "Fairy-Stockfish 加载失败"));
      return;
    }
    if (event.data.type !== "line" || typeof event.data.line !== "string") return;
    for (const waiter of [...fairyWaiters]) {
      if (!waiter.match(event.data.line)) continue;
      fairyWaiters.delete(waiter);
      window.clearTimeout(waiter.timer);
      waiter.resolve(event.data.line);
    }
  };
  worker.onerror = () => resetFairy(new Error("Fairy-Stockfish Worker 异常"));
  fairyWorker = worker;
  return worker;
}

function waitForFairy(match: (line: string) => boolean, timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const waiter: FairyWaiter = {
      match,
      resolve,
      reject,
      timer: window.setTimeout(() => {
        fairyWaiters.delete(waiter);
        reject(new Error("Fairy-Stockfish 响应超时"));
      }, timeoutMs),
    };
    fairyWaiters.add(waiter);
  });
}

function postFairy(command: string) {
  getFairyWorker().postMessage({ command });
}

async function ensureFairyReady() {
  if (fairyReady) return;
  if (fairyUnavailableReason) throw new Error(fairyUnavailableReason);
  if (!fairySupported()) throw new Error("当前页面未启用 SharedArrayBuffer，使用本地强力搜索");
  if (!fairyInit) {
    fairyInit = (async () => {
      const uciOk = waitForFairy((line) => line === "uciok", 12_000);
      postFairy("uci");
      await uciOk;
      postFairy("setoption name UCI_Variant value xiangqi");
      postFairy("setoption name Threads value 1");
      postFairy("setoption name Hash value 32");
      const readyOk = waitForFairy((line) => line === "readyok", 8_000);
      postFairy("isready");
      await readyOk;
      fairyReady = true;
    })().catch((error) => {
      resetFairy(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
  }
  await fairyInit;
}

async function requestFairy(board: XiangqiBoardState, side: XiangqiSide, fullMove: number) {
  if (fairySearchInFlight) resetFairy(new Error("新棋局已接管仙人引擎"));
  const task = (async () => {
    await ensureFairyReady();
    const bestMove = waitForFairy((line) => /^bestmove\s+/.test(line), 4_500);
    postFairy(`position fen ${boardToXiangqiFen(board, side, fullMove)}`);
    postFairy("go movetime 1100 depth 20");
    const line = await bestMove;
    const uci = line.split(/\s+/)[1] ?? "";
    return uciToXiangqiMove(uci, board);
  })();
  fairySearchInFlight = task;
  try {
    return await task;
  } catch (error) {
    if (fairySearchInFlight === task) resetFairy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    if (fairySearchInFlight === task) fairySearchInFlight = null;
  }
}

export async function warmupXiangqiImmortal() {
  try {
    await ensureFairyReady();
    return { ready: true as const, label: "Fairy-Stockfish NNUE" };
  } catch (error) {
    fairyUnavailableReason = error instanceof Error ? error.message : String(error);
    return { ready: false as const, label: "本地深度搜索", reason: fairyUnavailableReason };
  }
}

export async function requestXiangqiAiMove(args: {
  board: XiangqiBoardState;
  side: XiangqiSide;
  level: XiangqiSearchLevel;
  fullMove: number;
}): Promise<XiangqiAiResult> {
  if (args.level === "immortal") {
    try {
      const move = await requestFairy(args.board, args.side, args.fullMove);
      if (!move) throw new Error("仙人引擎没有返回可验证的合法着法");
      return {
        move,
        engine: "fairy-stockfish-nnue",
        label: "Fairy-Stockfish NNUE",
        depth: 20,
        nodes: 0,
        note: "使用支持中国象棋的 Stockfish 系搜索与 NNUE 评估；落子仍由本地完整规则二次校验。",
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!reason.includes("新棋局已接管")) fairyUnavailableReason = reason;
      const fallback = await requestLocal(args.board, args.side, "immortal");
      return {
        ...fallback,
        label: "Tim 本地深度搜索",
        note: `成熟引擎在此设备不可用，已自动切换迭代加深、静态交换与置换表搜索：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const result = await requestLocal(args.board, args.side, args.level);
  return {
    ...result,
    label: args.level === "young" ? "少年 Tim 基础搜索" : "樵夫 Tim 三层搜索",
    note: args.level === "young" ? "从不走非法棋，会在多个合理候选中保留入门级失误空间。" : "使用迭代加深、吃子延伸、将军检测与置换表。",
  };
}
