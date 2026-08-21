export type DifficultyKey = "middle" | "university" | "phd";

export type Question = {
  category: string;
  prompt: string;
  options: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  insight: string;
};

export type QuestionBank = Record<DifficultyKey, Question[]>;

export type DifficultyDefinition = {
  key: DifficultyKey;
  label: string;
  english: string;
  level: string;
  description: string;
  focus: string;
};

export const difficulties: DifficultyDefinition[] = [
  {
    key: "middle",
    label: "中学",
    english: "MIDDLE SCHOOL",
    level: "基础起步",
    description: "从常识和核心概念出发",
    focus: "识记 · 理解 · 基础判断",
  },
  {
    key: "university",
    label: "大学",
    english: "UNIVERSITY",
    level: "应用进阶",
    description: "考察机制、应用与迁移能力",
    focus: "原理 · 应用 · 情境推理",
  },
  {
    key: "phd",
    label: "博士",
    english: "DOCTORAL",
    level: "研究挑战",
    description: "深入理论、方法与证据边界",
    focus: "研究 · 辨析 · 方法论",
  },
];

export function defineQuestionBank(courseName: string, bank: QuestionBank): QuestionBank {
  const seenPrompts = new Set<string>();

  for (const difficulty of difficulties) {
    const questions = bank[difficulty.key];
    if (questions.length !== 20) {
      throw new Error(`${courseName} · ${difficulty.label}题库必须恰好包含 20 题，当前为 ${questions.length} 题。`);
    }

    for (const question of questions) {
      if (question.options.length !== 4) {
        throw new Error(`${courseName}题目“${question.prompt}”必须包含 4 个选项。`);
      }
      if (question.correct < 0 || question.correct > 3) {
        throw new Error(`${courseName}题目“${question.prompt}”的正确答案索引无效。`);
      }
      if (seenPrompts.has(question.prompt)) {
        throw new Error(`${courseName}存在重复题目：“${question.prompt}”。`);
      }
      seenPrompts.add(question.prompt);
    }
  }

  return bank;
}
