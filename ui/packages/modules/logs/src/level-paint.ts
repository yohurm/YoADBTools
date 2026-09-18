/**
 * 级别怎么画：色相只引用 `--yohu-level-${key}`；反色是本文件的 paint。
 * 已知级别的消息与级别字 / Tag 同 ink（行上 `data-level`）。
 * 禁止在 CSS / 本文件再列 V–F 六条 ink 映射或 color-mix。
 * 行反色只有 Fatal。筛选格走 YoSegmentedButton，不进本文件。
 */

import type { LevelKey } from "./filter";

export interface LevelPaint {
  invert: boolean;
}

export function levelPaint(key: LevelKey): LevelPaint {
  return { invert: key === "f" };
}

export function levelInkStyle(key: LevelKey): { "--yohu-log-ink": string } {
  return { "--yohu-log-ink": `var(--yohu-level-${key})` };
}
