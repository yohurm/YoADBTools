import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { LOGCAT_TAG_SWATCHES, MARKUP_HIGHLIGHT_ORDER } from "./markup-tokens";
import {
  LOGCAT_TAG_SWATCHES as UI_LOGCAT_TAG_SWATCHES,
  LogcatTagLight,
} from "@yohu/ui";

const here = dirname(fileURLToPath(import.meta.url));

function read(name: string): string {
  return readFileSync(resolve(here, name), "utf8");
}

/** markup.css 里 `::highlight(name)` 选择器的全部名字。 */
function cssHighlightNames(css: string): Set<string> {
  const names = new Set<string>();
  const re = /::highlight\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    names.add(match[1]!.trim());
  }
  return names;
}

describe("Markup 高亮名单与 CSS 契约", () => {
  it("markup.css 的 ::highlight 选择器与 MARKUP_HIGHLIGHT_ORDER 一一对应（无手写漏配）", () => {
    const order = new Set(MARKUP_HIGHLIGHT_ORDER);
    const css = cssHighlightNames(read("markup.css"));
    const missing = [...order].filter((name) => !css.has(name));
    const extra = [...css].filter((name) => !order.has(name));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("关键字 mark 排在最后（压在级别底之上），wash 级别底先登记", () => {
    const markIndex = MARKUP_HIGHLIGHT_ORDER.indexOf("yohu-log-mark");
    expect(markIndex).toBe(MARKUP_HIGHLIGHT_ORDER.length - 1);
    const firstWash = MARKUP_HIGHLIGHT_ORDER.indexOf("yohu-wash-level-v");
    expect(firstWash).toBeGreaterThanOrEqual(0);
    expect(firstWash).toBeLessThan(markIndex);
  });

  it("Logcat Tag 档数跨包单源：模块导出的 80 === @yohu/ui 档数 === LogcatTagLight.length", () => {
    expect(LOGCAT_TAG_SWATCHES).toBe(80);
    expect(UI_LOGCAT_TAG_SWATCHES).toBe(80);
    expect(LogcatTagLight).toHaveLength(80);
    expect(UI_LOGCAT_TAG_SWATCHES).toBe(LogcatTagLight.length);
    expect(LOGCAT_TAG_SWATCHES).toBe(UI_LOGCAT_TAG_SWATCHES);
  });

  it("Logcat Tag 档数覆盖 0..LOGCAT_TAG_SWATCHES-1", () => {
    for (let index = 0; index < LOGCAT_TAG_SWATCHES; index += 1) {
      expect(MARKUP_HIGHLIGHT_ORDER).toContain(`yohu-ink-logcat-tag-${index}`);
    }
    expect(MARKUP_HIGHLIGHT_ORDER).not.toContain(`yohu-ink-logcat-tag-${LOGCAT_TAG_SWATCHES}`);
  });

  it("wash 的 1ch 等宽前提有契约：文本节点显式 mono 字族，不再反写 tabular-nums", () => {
    const css = read("../logs.css");
    const block = css.match(/\.yohu-logs__text\s*\{[^}]*\}/)?.[0] ?? "";
    expect(block).toContain("font-family: var(--yohu-font-mono)");
    expect(block).not.toContain("font-variant-numeric: normal");
    expect(read("markup-wash.ts")).toContain("1ch");
  });
});
