/** 命令管理开着时，预览和提交都不进导入。拒绝句只有这一句。 */

export const IMPORT_MANAGER_OPEN = "请先关闭命令管理";

export function importBlockedByManager(managerOpen: boolean): string | null {
  return managerOpen ? IMPORT_MANAGER_OPEN : null;
}
