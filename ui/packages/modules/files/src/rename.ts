/** 重命名的标题、字段名与草稿校验。菜单和对话框共用标题；占用句与 core Display 同源。 */

import { alreadyExistsText, validateEntryName } from "@yohu/api";

import { childPath } from "./model";

export const RENAME_TITLE = "重命名";
export const RENAME_FIELD_LABEL = "新名称";

/** 落点占用的设备绝对路径；空位返回 null。源自身不算占用。 */
export function renameTakenPath(
  names: readonly string[],
  dir: string,
  from: string,
  next: string,
): string | null {
  if (next === from || !names.includes(next)) return null;
  const taken = childPath(dir, next);
  return taken.ok ? taken.path : null;
}

/** 草稿校验句。名称未变化不是错，只让确定钮不可点。 */
export function renameDraftError(name: string, takenPath: string | null): string | null {
  return validateEntryName(name) ?? (takenPath ? alreadyExistsText(takenPath) : null);
}

/** 可提交：名字合法、确实换了名、落点空着。 */
export function renameDraftReady(name: string, from: string, takenPath: string | null): boolean {
  return name.trim() !== from && renameDraftError(name, takenPath) === null;
}
