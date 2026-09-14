/**
 * 确认删除名单：默认只露前几项，展开后全量；移除只改待删列表。
 */

/** 折叠态最多露出的文件数。 */
export const DELETE_PREVIEW_LIMIT = 6;

export interface DeletePreview {
  shown: string[];
  hidden: number;
}

/** 按折叠态切出可见文件名；展开或未超上限则全量。 */
export function visibleDeleteNames(names: readonly string[], expanded: boolean): DeletePreview {
  if (expanded || names.length <= DELETE_PREVIEW_LIMIT) {
    return { shown: [...names], hidden: 0 };
  }
  return {
    shown: names.slice(0, DELETE_PREVIEW_LIMIT),
    hidden: names.length - DELETE_PREVIEW_LIMIT,
  };
}

/** 从待删名单去掉一项；同名只出现一次。 */
export function dropDeleteName(names: readonly string[], name: string): string[] {
  return names.filter((item) => item !== name);
}
