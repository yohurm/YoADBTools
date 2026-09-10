/**
 * 开关领域模型（L2）。
 * 开/关是不变式；涂装名给视图当 data-paint。
 * 不碰 DOM、不判定 disabled。
 */

export type SwitchPaintKind = "off" | "on";

export interface SwitchInput {
  checked?: boolean;
}

export interface SwitchSpec {
  checked: boolean;
}

export function resolveSwitchSpec(input: SwitchInput): SwitchSpec {
  return { checked: Boolean(input.checked) };
}

/** CSS 只消费这个名字。disabled 由 L3 另写，不进涂装。 */
export function switchPaintKind(spec: SwitchSpec): SwitchPaintKind {
  return spec.checked ? "on" : "off";
}
