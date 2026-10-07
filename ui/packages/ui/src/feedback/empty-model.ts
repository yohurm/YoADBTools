/**
 * 空态领域模型（L2）。
 * 插画 / 标题 / 描述 / 是否有 action / fill / size 是不变式。
 * fill 是参与父级伸缩，不是盖住下层。默认 hug。
 * size=sm 给窄栏（设备栏）；md 是页/面板空态。
 * 不碰 DOM、不渲染槽。
 */

export type EmptyStateSize = "md" | "sm";

/** 窄栏空态。模型和宿主 data-size 都认这一把。 */
export function emptySizeIsSm(size: EmptyStateSize | undefined): boolean {
  return size === "sm";
}

export interface EmptyStateInput {
  title: string;
  description?: string;
  hasIcon?: boolean;
  hasAction?: boolean;
  fill?: boolean;
  size?: EmptyStateSize;
}

export interface EmptyStateSpec {
  title: string;
  description: string | undefined;
  hasIcon: boolean;
  hasAction: boolean;
  fill: boolean;
  size: EmptyStateSize;
}

/** 描述空串不算。空态和区域加载都认这一把。 */
export function presentDescription(input: { description?: string }): string | undefined {
  const description = input.description;
  return description ? description : undefined;
}

/** 参与父级伸缩。空态和区域加载都认这一把。不是盖住下层。 */
export function fillIsOn(input: { fill?: boolean }): boolean {
  return Boolean(input.fill);
}

export function resolveEmptyStateSpec(input: EmptyStateInput): EmptyStateSpec {
  return {
    title: input.title,
    description: presentDescription(input),
    hasIcon: Boolean(input.hasIcon),
    hasAction: Boolean(input.hasAction),
    fill: fillIsOn(input),
    size: emptySizeIsSm(input.size) ? "sm" : "md",
  };
}
