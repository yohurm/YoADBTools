/**
 * Markup 高亮名单与 bucket 顺序单源。
 * - `LOGCAT_TAG_SWATCHES`：官方 ColorPaletteManager 的 80 档（族 16 × 阶 5）。
 *   须与 token 板 `tokens/logcat.ts` 的 `LogcatTagLight.length` 一致（契约测试锁死）。
 * - `MARKUP_HIGHLIGHT_ORDER`：`CSS.highlights` 的登记顺序（先 wash 底、后 mark 关键字底），
 *   决定重叠 Range 上的绘制先后。禁止散落手写。
 */

import { LEVELS } from "@yohu/api";
import { LOGCAT_TAG_SWATCHES } from "@yohu/ui";

/** 官方 Tag 色板档数：与 `@yohu/ui` token 板单源（`LogcatTagLight.length`），禁止本地常量。 */
export { LOGCAT_TAG_SWATCHES };

const LEVEL_KEYS = LEVELS.map((letter) => letter.toLowerCase());

/** 固定登记顺序：级别底 wash → 文字 ink → logcat 分色 → 关键字 mark（最后，压在最上）。 */
export const MARKUP_HIGHLIGHT_ORDER: readonly string[] = [
  ...LEVEL_KEYS.map((key) => `yohu-wash-level-${key}`),
  ...LEVEL_KEYS.map((key) => `yohu-wash-logcat-level-${key}-bg`),
  "yohu-ink-fg",
  "yohu-ink-fg-2",
  "yohu-ink-fg-3",
  ...LEVEL_KEYS.map((key) => `yohu-ink-level-${key}`),
  ...LEVEL_KEYS.map((key) => `yohu-ink-logcat-msg-${key}`),
  ...Array.from({ length: LOGCAT_TAG_SWATCHES }, (_, index) => `yohu-ink-logcat-tag-${index}`),
  "yohu-log-mark",
];

const RESERVED = new Set(MARKUP_HIGHLIGHT_ORDER);

/** bucket 是否保留（固定名单空桶不回收，保持登记顺序稳定）。 */
export function markupBucketReserved(name: string): boolean {
  return RESERVED.has(name);
}
