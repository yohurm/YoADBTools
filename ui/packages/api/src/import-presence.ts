/** 导入预览相对当前库。勾选和徽章都认这一把。 */

import type { ImportPresence } from "./types";

export function importAlreadyPresent(presence: ImportPresence): boolean {
  return presence === "existing";
}
