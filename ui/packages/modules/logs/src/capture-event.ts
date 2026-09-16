/**
 * 设备采集事件对账：只比 generation，禁止回拨。
 */

export type CaptureEventDecision =
  | { kind: "ignore" }
  | { kind: "running"; generation: number }
  | { kind: "stopped"; generation: number };

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
