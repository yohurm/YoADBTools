/**
 * 区域加载领域模型（L2）。
 * 标题 / 描述 / 是否铺满是不变式。
 * 不碰 DOM、不画环。
 */

export interface LoadingInput {
  title: string;
  description?: string;
  cover?: boolean;
}

export interface LoadingSpec {
  title: string;
  description: string | undefined;
  cover: boolean;
}

export function resolveLoadingSpec(input: LoadingInput): LoadingSpec {
  const description = input.description;
  return {
    title: input.title,
    description: description ? description : undefined,
    cover: Boolean(input.cover),
  };
}
