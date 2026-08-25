export type JumpChapter = {
  id: "pku" | "princeton" | "mit";
  school: string;
  chapter: string;
  min: number;
  max: number;
  speed: number;
  speedLabel: string;
};

export const jumpChapters: JumpChapter[] = [
  {
    id: "pku",
    school: "北京大学",
    chapter: "青春开场",
    min: 47,
    max: 53,
    speed: 0.1,
    speedLabel: "×1.0",
  },
  {
    id: "princeton",
    school: "普林斯顿",
    chapter: "跨洋求学",
    min: 67,
    max: 71,
    speed: 0.135,
    speedLabel: "×1.35",
  },
  {
    id: "mit",
    school: "MIT",
    chapter: "学术远征",
    min: 84,
    max: 87,
    speed: 0.17,
    speedLabel: "×1.7",
  },
];

export function advancePower(current: number, deltaMs: number, speed: number) {
  const rawNext = current + deltaMs * speed;
  return {
    power: rawNext >= 100 ? rawNext % 100 : rawNext,
    wrapped: rawNext >= 100,
  };
}

export function isSuccessfulLanding(power: number, chapter: Pick<JumpChapter, "min" | "max">) {
  return power >= chapter.min && power <= chapter.max;
}

export function starsForMisses(misses: number) {
  if (misses === 0) return 3;
  if (misses <= 2) return 2;
  return 1;
}
