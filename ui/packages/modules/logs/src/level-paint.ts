/**
 * 级别怎么画：色相只引用 `--yohu-level-${key}`；反色 / 消息同色是本文件的 paint。
 * 禁止在 CSS 再列 V–F 六条 ink 映射。
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
