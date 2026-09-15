/**
 * 确认删除名单：默认只露前几项，展开后全量；移除只改待删列表。
 */

/** 折叠态最多露出的文件数。 */
export const DELETE_PREVIEW_LIMIT = 6;

/** 超出预览才有展开/收起。收起钮钉在 Dialog tail，不进滚槽。 */
export function canToggleDelete(names: readonly string[]): boolean {
  return names.length > DELETE_PREVIEW_LIMIT;
}

/** 从待删名单去掉一项；同名只出现一次。 */
export function dropDeleteName(names: readonly string[], name: string): string[] {
  return names.filter((item) => item !== name);
}
