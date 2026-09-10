/**
 * 空态领域模型（L2）。
 * 插画 / 标题 / 描述 / 是否有 action 是不变式。
 * 不碰 DOM、不渲染槽。
 */

export interface EmptyStateInput {
  title: string;
  description?: string;
  hasIcon?: boolean;
  hasAction?: boolean;
}

export interface EmptyStateSpec {
  title: string;
  description: string | undefined;
  hasIcon: boolean;
  hasAction: boolean;
}

export function resolveEmptyStateSpec(input: EmptyStateInput): EmptyStateSpec {
  const description = input.description;
  return {
    title: input.title,
    description: description ? description : undefined,
    hasIcon: Boolean(input.hasIcon),
    hasAction: Boolean(input.hasAction),
  };
}
