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
  boardSize: number;
  stones: GoSetupStone[];
  correctMoves: GoPoint[];
  sequence: GoPoint[];
  toPlay: 1 | 2;
};

export type GoQuestion = GoChoiceQuestion | GoBoardQuestion;

export type GoOpponent = {
  id: "normal" | "hero" | "emperor" | "saiyan";
  name: string;
  rank: string;
  description: string;
  image: string;
  color: string;
};
