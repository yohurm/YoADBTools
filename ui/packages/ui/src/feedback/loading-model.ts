/**
 * 区域加载领域模型（L2）。
 * 标题 / 描述 / cover / fill 是不变式。
 * cover 盖住下层；fill 参与父级伸缩。二者不是别名。
 * 不碰 DOM、不画环。
 */

export interface LoadingInput {
  title: string;
  description?: string;
  cover?: boolean;
  fill?: boolean;
}

export interface LoadingSpec {
  title: string;
  description: string | undefined;
  cover: boolean;
  fill: boolean;
}

export function resolveLoadingSpec(input: LoadingInput): LoadingSpec {
  const description = input.description;
  return {
    title: input.title,
    description: description ? description : undefined,
    cover: Boolean(input.cover),
    fill: Boolean(input.fill),
  };
}
