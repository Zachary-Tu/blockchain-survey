export const M1_CHART_FRAME = Object.freeze({
  width: 1120,
  height: 600,
  margin: Object.freeze({ top: 72, right: 28, bottom: 72, left: 88 }),
});

const M1_DISCLOSURE_SAFE_METRIC_COPY = Object.freeze({
  price: "该曲线表示价格数据。",
  activeAddresses: "该曲线表示活跃地址数量数据。",
  googleTrends: "该曲线表示 Google 搜索热度指数。",
});

export function m1MetricDescription(
  metric: keyof typeof M1_DISCLOSURE_SAFE_METRIC_COPY,
  axesRevealed: boolean,
  fullDefinition: string,
) {
  return axesRevealed ? fullDefinition : M1_DISCLOSURE_SAFE_METRIC_COPY[metric];
}

export function m1DisclosureVisibility(
  key: "G0" | "GI1" | "GI2" | "DI1" | "DI2" | "DI3" | "DI4" | "FULL",
  path: "general" | "domain" | "combined",
) {
  const domainLevel = key.startsWith("DI") ? Number(key.slice(2)) : 0;
  const combinedDomain = path === "combined" && domainLevel > 0;
  return {
    metric: key === "GI1" || key === "GI2" || key === "FULL" || combinedDomain,
    axes: key === "GI2" || key === "FULL" || combinedDomain,
    asset: domainLevel >= 1 || key === "FULL",
    intro: domainLevel >= 2 || key === "FULL",
    highEvents: domainLevel >= 3 || key === "FULL",
    lowEvents: domainLevel >= 4 || key === "FULL",
  };
}

export function m1RailStepState(
  keys: readonly string[],
  activeIndex: number,
  index: number,
) {
  const revealed = index <= activeIndex;
  const repeatControl = keys.length > 1 && keys.every((key) => key === "G0");
  if (!revealed) {
    return { revealed: false, active: false, titleMode: "locked" as const };
  }
  return {
    revealed: true,
    active: index === activeIndex,
    titleMode: repeatControl || index === 0 ? "neutral-round" as const : "disclosure" as const,
  };
}
