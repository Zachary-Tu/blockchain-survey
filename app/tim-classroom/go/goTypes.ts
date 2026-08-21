export type GoMode = "learn" | "play";

export type GoLevel = {
  id: number;
  rank: string;
  title: string;
  subtitle: string;
  focus: string;
  color: string;
  image: string;
  objectives: string[];
  lessons: Array<{ title: string; body: string; tip: string }>;
};

export type GoPoint = { row: number; col: number };
export type GoSetupStone = GoPoint & { color: 1 | 2 };

export type GoPuzzleTask =
  | "capture"
  | "save"
  | "connect"
  | "cut"
  | "ladder"
  | "net"
  | "tesuji"
  | "life"
  | "kill"
  | "capturing-race"
  | "shape"
  | "joseki"
  | "opening"
  | "middle-game"
  | "endgame"
  | "whole-board";

export type GoPuzzleRefutation = {
  move: GoPoint;
  response: GoPoint[];
  explanation: string;
};

export type GoCandidatePoint = GoPoint & {
  label: "A" | "B" | "C" | "D";
};

export type GoPuzzleObjective = {
  kind: "capture-target" | "save-target" | "connect-targets" | "make-eye" | "occupy-vital";
  label: string;
  targetColor: 1 | 2;
  anchors: GoPoint[];
  goalPoints?: GoPoint[];
  minLiberties?: number;
  maxPlayerMoves: number;
  region: { top: number; left: number; bottom: number; right: number };
};

type GoQuestionBase = {
  id: string;
  family: string;
  category: string;
  prompt: string;
  explanation: string;
};

export type GoChoiceQuestion = GoQuestionBase & {
  type: "choice";
  options: string[];
  correct: number;
};

export type GoBoardQuestion = GoQuestionBase & {
  type: "board";
  mode: "candidate" | "objective";
  task: GoPuzzleTask;
  boardSize: number;
  stones: GoSetupStone[];
  toPlay: 1 | 2;
  /** Alternating moves beginning with `toPlay`. Every line is a complete valid variation. */
  solutionLines: GoPoint[][];
  /** All labelled points shown to the learner in candidate mode. */
  candidateMoves?: GoCandidatePoint[];
  /** Goal checked from the resulting board rather than against one memorized coordinate. */
  objective?: GoPuzzleObjective;
  /** Teaching notes corresponding to the canonical line, one note per move where available. */
  stepNotes: string[];
  hint: string;
  success: string;
  failure: string;
  refutations: GoPuzzleRefutation[];
};

export type GoQuestion = GoChoiceQuestion | GoBoardQuestion;

export type GoOpponent = {
  id: "normal" | "hero" | "emperor" | "robot" | "saiyan";
  name: string;
  rank: string;
  description: string;
  image: string;
  color: string;
  estimatedRank: string;
  enginePlan: string;
};
