import type { CanvasDemoConfig } from "@/lib/types";

export const DEMO_BALANCE_MODE = "demo_balance";

export function normalizeCanvasDemoConfig(raw?: CanvasDemoConfig | null): CanvasDemoConfig {
  const mode = raw?.mode === DEMO_BALANCE_MODE ? DEMO_BALANCE_MODE : "normal";
  const optionA = (raw?.option_a || "").trim();
  const optionB = (raw?.option_b || "").trim();
  const enabled = Boolean(raw?.enabled || mode === DEMO_BALANCE_MODE) && Boolean(optionA && optionB);

  if (!enabled) {
    return {
      enabled: false,
      mode: "normal",
      option_a: "",
      option_b: "",
      instruction: "",
    };
  }

  return {
    enabled: true,
    mode: DEMO_BALANCE_MODE,
    option_a: optionA,
    option_b: optionB,
    instruction: (raw?.instruction || "발화할 때 A 또는 B를 먼저 말하고 이유를 설명해 주세요.").trim(),
  };
}

export function isDemoBalanceConfig(raw?: CanvasDemoConfig | null): boolean {
  const config = normalizeCanvasDemoConfig(raw);
  return Boolean(config.enabled) && config.mode === DEMO_BALANCE_MODE;
}

export function buildDemoBalanceMeetingGoal(title: string, optionA: string, optionB: string): string {
  const cleanTitle = title.trim() || "밸런스 게임";
  return `${cleanTitle}: A(${optionA.trim()})와 B(${optionB.trim()}) 중 하나를 선택하고 이유를 말하는 밸런스 게임`;
}

export function buildDemoBalanceMeetingContext(optionA: string, optionB: string): string {
  return [
    `시연용 밸런스 게임`,
    `A=${optionA.trim()}`,
    `B=${optionB.trim()}`,
    `참가자는 발화 시작에 A 또는 B를 명시한다.`,
    `AI는 A/B 선택과 이유를 분류하고, 최종 요약에서 유효 의견 비율과 설득력 matrix를 만든다.`,
  ].join(", ");
}
