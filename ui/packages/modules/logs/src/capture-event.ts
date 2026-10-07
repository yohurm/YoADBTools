/**
 * 设备采集事件对账：只比 generation，禁止回拨。
 */

export type CaptureEventDecision =
  | { kind: "ignore" }
  | { kind: "running"; generation: number }
  | { kind: "stopped"; generation: number };

export function captureDecisionIsIgnore(
  decision: CaptureEventDecision,
): decision is { kind: "ignore" } {
  return decision.kind === "ignore";
}

export function captureDecisionIsStopped(
  decision: CaptureEventDecision,
): decision is { kind: "stopped"; generation: number } {
  return decision.kind === "stopped";
}

export function applyCaptureEvent(
  currentGeneration: number,
  eventGeneration: number,
  running: boolean,
): CaptureEventDecision {
  if (eventGeneration < currentGeneration) return { kind: "ignore" };
  return running
    ? { kind: "running", generation: eventGeneration }
    : { kind: "stopped", generation: eventGeneration };
}
