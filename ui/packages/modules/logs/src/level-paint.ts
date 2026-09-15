/**
 * 级别怎么画：色相只引用 `--yohu-level-${key}`；反色 / 消息同色是本文件的 paint。
 * 禁止在 CSS / 本文件再列 V–F 六条 ink 映射或 color-mix。
 * 行反色只有 Fatal。筛选格按下由 YoButton inherit（底 fill、字 fg-on），不进本文件。
 */

import type { LevelKey } from "./filter";

export interface LevelPaint {
  invert: boolean;
  tintMessage: boolean;
}

export function levelPaint(key: LevelKey): LevelPaint {
  return {
    invert: key === "f",
    tintMessage: key === "e" || key === "f",
  };
}

export function levelInkStyle(key: LevelKey): { "--yohu-log-ink": string } {
  return { "--yohu-log-ink": `var(--yohu-level-${key})` };
}
