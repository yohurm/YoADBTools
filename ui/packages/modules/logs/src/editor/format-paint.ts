/**
 * Formatter 着色：ColorEngine / token 命名。对照 AS 两套配色（Yohu / 官方 Logcat V2）。
 * 只产出 range 的 tone / box / style，写入是 Document 的事；禁止 import Document / Board / View / store。
 */

import {
  isLogColorScheme,
  levelKey,
  LOG_COLOR_SCHEME_DEFAULT,
  type LogColorScheme,
} from "@yohu/api";

import type { TokenTone } from "./token-tone";
import {
  logFieldIsClock,
  logFieldIsLevel,
  logFieldIsMessage,
  logFieldIsProcess,
  type LogColKey,
} from "./format-columns";
import { LOGCAT_TAG_SWATCHES } from "./markup-tokens";

export type TokenBox = "glyph" | "line";

/**
 * Range 的着色载体键：只承载 token 名（`var(--yohu-*)`），与真实行左条 CSS 变量
 * `--yohu-log-ink` 分家，避免一名两用。
 */
export type TokenStyle = {
  "--yohu-log-token-ink"?: string;
  "--yohu-log-token-fg"?: string;
  "--yohu-log-token-bg"?: string;
};
export type TokenPaint = {
  tone: TokenTone;
  box?: TokenBox;
  style?: TokenStyle;
};
export type ContentBar = "level" | "none";

export type FormatRange = {
  start: number;
  end: number;
  kind: LogColKey;
  tone?: TokenTone;
  box?: TokenBox;
  style?: TokenStyle;
};

type ColorEngine = {
  id: LogColorScheme;
  bar: ContentBar;
  barInk(line: { level: string }): string | undefined;
  token(kind: LogColKey, line: { level: string; tag: string }): TokenPaint;
};

function ink(token: string): TokenPaint {
  return { tone: "ink", box: "glyph", style: { "--yohu-log-token-ink": token } };
}

function wash(fg: string, bg: string): TokenPaint {
  return {
    tone: "wash",
    box: "line",
    style: { "--yohu-log-token-fg": fg, "--yohu-log-token-bg": bg },
  };
}

function unstyled(): TokenPaint {
  return { tone: "plain", box: "glyph" };
}

/** 没有级别色时：消息用正文色，其余列不涂。两套配色都认这一把。 */
function plainMessageInk(kind: LogColKey): TokenPaint {
  return logFieldIsMessage(kind) ? ink("var(--yohu-fg)") : unstyled();
}

function levelInk(
  kind: LogColKey,
  key: ReturnType<typeof levelKey>,
  paint: (key: NonNullable<ReturnType<typeof levelKey>>) => TokenPaint,
): TokenPaint {
  if (!key) {
    return plainMessageInk(kind);
  }
  return paint(key);
}

export function yohuLevelVar(key: NonNullable<ReturnType<typeof levelKey>>): string {
  return `var(--yohu-level-${key})`;
}

const yohuEngine: ColorEngine = {
  id: "yohu",
  bar: "level",
  barInk(line) {
    const key = levelKey(line.level);
    return key ? yohuLevelVar(key) : undefined;
  },
  token(kind, line) {
    if (logFieldIsClock(kind)) {
      return ink("var(--yohu-fg-3)");
    }
    if (logFieldIsProcess(kind)) {
      return ink("var(--yohu-fg-2)");
    }
    return levelInk(kind, levelKey(line.level), (key) => {
      if (logFieldIsLevel(kind)) {
        return wash("var(--yohu-fg-on)", yohuLevelVar(key));
      }
      return ink(yohuLevelVar(key));
    });
  },
};

export function javaStringHash(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}

export function tagSwatchIndex(tag: string): number {
  return Math.abs(javaStringHash(tag)) % LOGCAT_TAG_SWATCHES;
}

/** 设备 FATAL 字母。清单显示成 A，配色仍按 F。 */
function levelIsDeviceFatal(level: string): boolean {
  return level === "F";
}

/** 官方 ASSERT：设备 F，或清单里已经写成 A。配色都按 F。 */
function levelIsAssert(level: string): boolean {
  return levelIsDeviceFatal(level) || level === "A";
}

function logcatLevelSwatch(level: string) {
  const paint = levelIsAssert(level) ? "F" : level;
  return levelKey(paint);
}

function logcatLevelVar(key: NonNullable<ReturnType<typeof levelKey>>, suffix = ""): string {
  return `var(--yohu-logcat-level-${key}${suffix})`;
}

/** AS `LevelFormat`：设备 FATAL（`F`）在清单里显示为 ASSERT 字母 `A`。 */
export function logcatLevelLetter(level: string): string {
  if (levelIsDeviceFatal(level)) {
    return "A";
  }
  return level;
}

const logcatEngine: ColorEngine = {
  id: "logcat",
  bar: "none",
  barInk() {
    return undefined;
  },
  token(kind, line) {
    if (logFieldIsClock(kind) || logFieldIsProcess(kind)) {
      return unstyled();
    }
    if (kind === "tag") {
      return ink(`var(--yohu-logcat-tag-${tagSwatchIndex(line.tag)})`);
    }
    return levelInk(kind, logcatLevelSwatch(line.level), (key) => {
      if (logFieldIsLevel(kind)) {
        return wash(logcatLevelVar(key), logcatLevelVar(key, "-bg"));
      }
      if (logFieldIsMessage(kind)) {
        return ink(`var(--yohu-logcat-msg-${key})`);
      }
      return unstyled();
    });
  },
};

const ENGINES: Record<LogColorScheme, ColorEngine> = {
  yohu: yohuEngine,
  logcat: logcatEngine,
};

export function contentColor(id: string | undefined): ColorEngine {
  return id && isLogColorScheme(id) ? ENGINES[id] : ENGINES[LOG_COLOR_SCHEME_DEFAULT];
}
