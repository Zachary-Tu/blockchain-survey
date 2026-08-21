import { boardHash, chooseAiMove, playMove } from "./goEngine";
import type { GoBoardState, GoColor, GoPoint } from "./goEngine";
import type { GoOpponent } from "./goTypes";

type NeuralPlayer = "black" | "white";
type NeuralBoard = Array<Array<NeuralPlayer | null>>;

export type GoAiHistoryMove = {
  x: number;
  y: number;
  player: NeuralPlayer;
};

type NeuralCandidate = {
  x: number;
  y: number;
  visits: number;
  pointsLost: number;
  relativePointsLost?: number;
  order: number;
  prior?: number;
  pv?: string[];
};

type NeuralAnalysis = {
  rootScoreLead: number;
  rootVisits: number;
  moves: NeuralCandidate[];
};

type NeuralClient = {
  init: (modelUrl: string, backend?: "webgpu" | "wasm" | "cpu") => Promise<void>;
  analyze: (args: {
    analysisGroup?: "interactive" | "background";
    modelUrl: string;
    backend?: "webgpu" | "wasm" | "cpu";
    board: NeuralBoard;
    previousBoard?: NeuralBoard;
    previousPreviousBoard?: NeuralBoard;
    currentPlayer: NeuralPlayer;
    moveHistory: GoAiHistoryMove[];
    komi: number;
    rules: "chinese";
    topK: number;
    analysisPvLen: number;
    visits: number;
    maxTimeMs: number;
    maxChildren: number;
    wideRootNoise: number;
    nnRandomize: boolean;
    conservativePass: boolean;
    ownershipMode: "none";
  }) => Promise<NeuralAnalysis>;
  getEngineInfo: () => { backend: string | null; modelName: string | null };
};

type NeuralModule = {
  getKataGoEngineClient: () => NeuralClient;
  resetKataGoEngineClientForTests: () => void;
};

export type GoAiResult = {
  move: GoPoint | null;
  engine: "neural-mcts" | "tactical-fallback";
  backend: string;
  modelName: string;
  visits: number;
  scoreLead: number | null;
  principalVariation: string[];
  note: string;
};

type SearchBudget = {
  visits: number;
  maxTimeMs: number;
  maxChildren: number;
  lossWindow: number;
  candidateLimit: number;
};

type ModelProfile = {
  tier: "compact" | "strong";
  url: string;
  downloadLabel: string;
  publicLabel: string;
};

const compactModel: ModelProfile = {
  tier: "compact",
  url: "/tim-classroom/go/engine/katago-small.bin.gz",
  downloadLabel: "约 3.8 MB",
  publicLabel: "b6 轻量网络",
};

const strongModel: ModelProfile = {
  tier: "strong",
  url: "/tim-classroom/go/engine/katago-b10.bin.gz",
  downloadLabel: "约 10.6 MB",
  publicLabel: "b10 强化网络",
};

let clientPromise: Promise<NeuralClient> | null = null;
let modelLoadQueue: Promise<void> = Promise.resolve();
let activeModelUrl: string | null = null;
let strongModelFailure: string | null = null;
let neuralModule: NeuralModule | null = null;
let timeoutStrikes = 0;

const searchBudgets: Record<GoOpponent["id"], Record<number, SearchBudget>> = {
  normal: {
    9: { visits: 22, maxTimeMs: 420, maxChildren: 18, lossWindow: 3.2, candidateLimit: 8 },
    13: { visits: 18, maxTimeMs: 480, maxChildren: 20, lossWindow: 3.0, candidateLimit: 8 },
    19: { visits: 14, maxTimeMs: 560, maxChildren: 22, lossWindow: 2.8, candidateLimit: 7 },
  },
  hero: {
    9: { visits: 42, maxTimeMs: 620, maxChildren: 24, lossWindow: 1.6, candidateLimit: 5 },
    13: { visits: 32, maxTimeMs: 700, maxChildren: 26, lossWindow: 1.5, candidateLimit: 5 },
    19: { visits: 24, maxTimeMs: 780, maxChildren: 28, lossWindow: 1.4, candidateLimit: 5 },
  },
  emperor: {
    9: { visits: 72, maxTimeMs: 850, maxChildren: 30, lossWindow: 0.65, candidateLimit: 3 },
    13: { visits: 54, maxTimeMs: 930, maxChildren: 32, lossWindow: 0.6, candidateLimit: 3 },
    19: { visits: 38, maxTimeMs: 1050, maxChildren: 34, lossWindow: 0.55, candidateLimit: 3 },
  },
  robot: {
    9: { visits: 118, maxTimeMs: 1150, maxChildren: 38, lossWindow: 0.22, candidateLimit: 2 },
    13: { visits: 82, maxTimeMs: 1300, maxChildren: 40, lossWindow: 0.18, candidateLimit: 2 },
    19: { visits: 56, maxTimeMs: 1450, maxChildren: 42, lossWindow: 0.14, candidateLimit: 2 },
  },
  saiyan: {
    9: { visits: 180, maxTimeMs: 1550, maxChildren: 48, lossWindow: 0, candidateLimit: 1 },
    13: { visits: 126, maxTimeMs: 1750, maxChildren: 50, lossWindow: 0, candidateLimit: 1 },
    19: { visits: 84, maxTimeMs: 1950, maxChildren: 52, lossWindow: 0, candidateLimit: 1 },
  },
};

function toNeuralBoard(board: GoBoardState): NeuralBoard {
  return board.map((row) => row.map((stone) => stone === 1 ? "black" : stone === 2 ? "white" : null));
}

function backendPreference(): "webgpu" | "wasm" {
  const navigatorWithGpu = globalThis.navigator as Navigator & { gpu?: unknown };
  return navigatorWithGpu?.gpu ? "webgpu" : "wasm";
}

function deviceCanSafelyLoadStrongModel() {
  const device = globalThis.navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
  const memory = device?.deviceMemory ?? 4;
  const cores = device?.hardwareConcurrency ?? 4;
  return Boolean(device?.gpu) && memory >= 4 && cores >= 4 && timeoutStrikes === 0;
}

function modelForOpponent(opponentId: GoOpponent["id"]): ModelProfile {
  return (opponentId === "robot" || opponentId === "saiyan") && deviceCanSafelyLoadStrongModel()
    ? strongModel
    : compactModel;
}

export function getGoAiModelProfile(opponentId: GoOpponent["id"]) {
  const profile = modelForOpponent(opponentId);
  return {
    tier: profile.tier,
    downloadLabel: profile.downloadLabel,
    publicLabel: profile.publicLabel,
  };
}

async function getEngineClient(): Promise<NeuralClient> {
  if (!clientPromise) {
    clientPromise = import("web-katrain-engine/src/engine/katago/client")
      .then((module) => {
        neuralModule = module as unknown as NeuralModule;
        return neuralModule.getKataGoEngineClient();
      })
      .catch((error: unknown) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

function resetEngineClient() {
  try {
    neuralModule?.resetKataGoEngineClientForTests();
  } catch {
    // A worker may already have terminated. Resetting our references is still safe.
  }
  clientPromise = null;
  activeModelUrl = null;
  modelLoadQueue = Promise.resolve();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      timeoutStrikes += 1;
      resetEngineClient();
      reject(new Error(`${label}超时，已重启围棋引擎`));
    }, timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        timeoutStrikes = Math.max(0, timeoutStrikes - 1);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function loadEngine(model: ModelProfile): Promise<NeuralClient> {
  const client = await getEngineClient();
  if (activeModelUrl === model.url) return client;

  const load = modelLoadQueue
    .catch(() => undefined)
    .then(async () => {
      if (activeModelUrl === model.url) return;
      await withTimeout(client.init(model.url, backendPreference()), 12_000, "模型加载");
      activeModelUrl = model.url;
    });
  modelLoadQueue = load;
  await load;
  return client;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function warmupGoAiEngine(opponentId: GoOpponent["id"] = "normal") {
  const preferred = modelForOpponent(opponentId);
  try {
    const client = await loadEngine(preferred);
    const info = client.getEngineInfo();
    return {
      ready: true as const,
      backend: info.backend ?? "ready",
      modelName: info.modelName ?? preferred.publicLabel,
      tier: preferred.tier,
      degraded: false,
    };
  } catch (error) {
    if (preferred.tier === "strong") {
      strongModelFailure = errorMessage(error);
      try {
        const client = await loadEngine(compactModel);
        const info = client.getEngineInfo();
        return {
          ready: true as const,
          backend: info.backend ?? "ready",
          modelName: info.modelName ?? compactModel.publicLabel,
          tier: compactModel.tier,
          degraded: true,
        };
      } catch (fallbackError) {
        return { ready: false as const, error: errorMessage(fallbackError) };
      }
    }
    return { ready: false as const, error: errorMessage(error) };
  }
}

function seededUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return (hash >>> 0) / 4294967296;
}

function candidateLoss(candidate: NeuralCandidate) {
  const loss = candidate.relativePointsLost ?? candidate.pointsLost;
  return Number.isFinite(loss) ? Math.max(0, loss) : 99;
}

function chooseTeachingCandidate(
  candidates: NeuralCandidate[],
  opponentId: GoOpponent["id"],
  budget: SearchBudget,
  seed: string,
) {
  const ordered = [...candidates].sort((left, right) => left.order - right.order);
  const top = ordered[0];
  if (!top || opponentId === "saiyan") return top ?? null;

  const second = ordered[1];
  const forcedGap = second ? candidateLoss(second) - candidateLoss(top) : 99;
  const forcedPolicy = (top.prior ?? 0) >= 0.42;
  if (forcedGap >= 2.2 || forcedPolicy) return top;

  const pool = ordered
    .filter((candidate) => candidateLoss(candidate) <= budget.lossWindow)
    .slice(0, budget.candidateLimit);
  if (pool.length <= 1) return top;

  const temperature = opponentId === "normal" ? 1.65 : opponentId === "hero" ? 0.85 : opponentId === "emperor" ? 0.35 : 0.15;
  const weights = pool.map((candidate) => {
    const searchConfidence = Math.sqrt(Math.max(1, candidate.visits));
    const policyConfidence = Math.max(0.015, candidate.prior ?? 0.015);
    return Math.exp(-candidateLoss(candidate) / temperature) * searchConfidence * Math.sqrt(policyConfidence);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = seededUnit(seed) * total;
  for (let index = 0; index < pool.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return pool[index];
  }
  return pool[0];
}

function fallbackResult(
  board: GoBoardState,
  aiColor: GoColor,
  opponentId: GoOpponent["id"],
  positionHistory: string[],
  moveNumber: number,
  reason: string,
): GoAiResult {
  return {
    move: chooseAiMove(board, aiColor, opponentId, positionHistory, moveNumber),
    engine: "tactical-fallback",
    backend: "local",
    modelName: "Tim tactical reader",
    visits: 0,
    scoreLead: null,
    principalVariation: [],
    note: `神经网络暂不可用，已切换本地战术搜索：${reason}`,
  };
}

export async function requestGoAiMove(args: {
  board: GoBoardState;
  previousBoard?: GoBoardState;
  previousPreviousBoard?: GoBoardState;
  aiColor: GoColor;
  opponentId: GoOpponent["id"];
  positionHistory: string[];
  moveHistory: GoAiHistoryMove[];
  moveNumber: number;
}): Promise<GoAiResult> {
  const size = args.board.length;
  const budget = searchBudgets[args.opponentId][size] ?? searchBudgets[args.opponentId][9];
  const preferredModel = modelForOpponent(args.opponentId);
  const initialModel = preferredModel.tier === "strong" && strongModelFailure ? compactModel : preferredModel;
  let activeModel = initialModel;
  let degradedReason = initialModel === compactModel && preferredModel.tier === "strong"
    ? strongModelFailure
    : null;

  const analyzeWithModel = async (model: ModelProfile) => {
    const client = await loadEngine(model);
    const analysis = await withTimeout(client.analyze({
      analysisGroup: "interactive",
      modelUrl: model.url,
      backend: backendPreference(),
      board: toNeuralBoard(args.board),
      previousBoard: args.previousBoard ? toNeuralBoard(args.previousBoard) : undefined,
      previousPreviousBoard: args.previousPreviousBoard ? toNeuralBoard(args.previousPreviousBoard) : undefined,
      currentPlayer: args.aiColor === 1 ? "black" : "white",
      moveHistory: args.moveHistory,
      komi: 7.5,
      rules: "chinese",
      topK: 10,
      analysisPvLen: 10,
      visits: budget.visits,
      maxTimeMs: budget.maxTimeMs,
      maxChildren: budget.maxChildren,
      wideRootNoise: 0,
      nnRandomize: false,
      conservativePass: true,
      ownershipMode: "none",
    }), budget.maxTimeMs + 2_500, "落子搜索");
    return { client, analysis };
  };

  try {
    let result: Awaited<ReturnType<typeof analyzeWithModel>>;
    try {
      result = await analyzeWithModel(activeModel);
    } catch (error) {
      if (activeModel.tier !== "strong") throw error;
      strongModelFailure = errorMessage(error);
      degradedReason = strongModelFailure;
      activeModel = compactModel;
      result = await analyzeWithModel(compactModel);
    }
    const { client, analysis } = result;

    const legalCandidates = analysis.moves.filter((candidate) => {
      if (candidate.x < 0 || candidate.y < 0) return true;
      return playMove(args.board, args.aiColor, { row: candidate.y, col: candidate.x }, args.positionHistory).valid;
    });
    const chosen = chooseTeachingCandidate(
      legalCandidates,
      args.opponentId,
      budget,
      `${boardHash(args.board)}:${args.moveNumber}:${args.opponentId}`,
    );
    if (!chosen) {
      return {
        move: null,
        engine: "neural-mcts",
        backend: client.getEngineInfo().backend ?? "neural",
        modelName: client.getEngineInfo().modelName ?? activeModel.publicLabel,
        visits: analysis.rootVisits,
        scoreLead: analysis.rootScoreLead,
        principalVariation: [],
        note: "搜索判断当前局面应停一手。",
      };
    }

    const info = client.getEngineInfo();
    return {
      move: chosen.x < 0 || chosen.y < 0 ? null : { row: chosen.y, col: chosen.x },
      engine: "neural-mcts",
      backend: info.backend ?? "neural",
      modelName: info.modelName ?? activeModel.publicLabel,
      visits: analysis.rootVisits,
      scoreLead: analysis.rootScoreLead,
      principalVariation: chosen.pv ?? [],
      note: degradedReason
        ? `强化网络在此设备不可用，已自动改用轻量网络并保留本档搜索预算。原因：${degradedReason}`
        : args.opponentId === "saiyan"
          ? "使用 b10 强化网络，并采用最高访问数下的搜索第一候选。"
          : args.opponentId === "robot"
            ? `使用 ${activeModel.publicLabel} 精确搜索，只在几乎等价的前两候选中择一。`
          : `使用 ${activeModel.publicLabel}，从不超过 ${budget.lossWindow.toFixed(1)} 目损失的合理候选中按本档棋力选择。`,
    };
  } catch (error) {
    return fallbackResult(
      args.board,
      args.aiColor,
      args.opponentId,
      args.positionHistory,
      args.moveNumber,
      error instanceof Error ? error.message : String(error),
    );
  }
}
