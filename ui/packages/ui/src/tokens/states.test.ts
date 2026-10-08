import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function loadStatesCss(): string {
  const candidates = [
    resolve(here, "states.css"),
    resolve(process.cwd(), "src/tokens/states.css"),
    resolve(process.cwd(), "packages/ui/src/tokens/states.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

function loadCss(rel: string): string {
  const path = resolve(here, rel);
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

const statesCss = loadStatesCss();
const chipCss = loadCss("../display/Chip.css");
const toastCss = loadCss("../overlay/Toast.css");
const textFieldCss = loadCss("../form/TextField.css");
const searchCss = loadCss("../search/Search.css");
const dismissCss = loadCss("../display/dismiss-mark.css");
const clearCss = loadCss("../form/clear-mark.css");

describe("yohu-interactive 叠层契约", () => {
  it("states.css 可读取", () => {
    expect(statesCss.length).toBeGreaterThan(0);
  });

  it("选中片 ::before 使用负 z-index，避免盖住流内文本节点", () => {
    const block = statesCss.match(/\.yohu-interactive::before\s*\{[^}]+\}/);
    expect(block?.[0]).toMatch(/z-index:\s*-1/);
    expect(block?.[0]).toContain("transform: var(--yohu-interactive-wash-transform, none)");
    expect(block?.[0]).not.toContain("scale(");
  });

  it("选中片自己在负层，不抬直接子级", () => {
    expect(statesCss).not.toContain(".yohu-interactive > *");
    const block = statesCss.match(/\.yohu-interactive::before\s*\{[^}]+\}/);
    expect(block?.[0]).toMatch(/z-index:\s*-1/);
  });

  it("选中字色走 --yohu-state-selected-fg，禁止表面另写 accent 字", () => {
    expect(statesCss).toContain("color: var(--yohu-state-selected-fg)");
    expect(statesCss).toContain("background: var(--yohu-state-selected)");
  });

  it("语义色逃生：yohu-badge / yohu-tone 不吃选中字色", () => {
    expect(statesCss).toContain(".yohu-badge");
    expect(statesCss).toContain(".yohu-tone");
  });

  it("不再桥 log-ink 到按钮 inherit", () => {
    expect(statesCss).not.toContain(".yohu-ink");
    expect(statesCss).not.toContain("--yohu-button-ink");
    expect(statesCss).not.toContain("--yohu-button-fill");
    expect(statesCss).not.toContain("ink-wash");
    expect(statesCss).not.toContain("color-mix");
    expect(statesCss).not.toContain("--yohu-button-soft");
  });

  it("焦点环 Tab 才画，跟宿主圆角，禁止 outline 直角", () => {
    expect(statesCss).toContain('html[data-yohu-focus="keyboard"]');
    expect(statesCss).toContain("border-radius: inherit");
    expect(statesCss).toContain("border: var(--yohu-focus-width) solid var(--yohu-focus-ring)");
    expect(statesCss).not.toMatch(/\.yohu-focus-ring:focus-visible\s*\{[^}]*outline:\s*var\(--yohu-focus-width\)/);
    expect(statesCss).not.toContain("yohu-focus-host--inset");
  });

  it("连续选中削平邻接圆角，不另画项间分割线", () => {
    expect(statesCss).toContain("yohu-interactive--sel-start");
    expect(statesCss).toContain("yohu-interactive--sel-mid");
    expect(statesCss).toContain("yohu-interactive--sel-end");
    expect(statesCss).toContain("border-end-start-radius: 0");
    expect(statesCss).toContain("border-radius: 0");
    expect(statesCss).toContain("border-start-start-radius: 0");
    expect(statesCss).not.toContain("selected-rule");
    expect(statesCss).not.toContain("sel-start::after");
    expect(statesCss).not.toContain("sel-mid::after");
  });

  it("正圆关闭由关闭钮自己画，交互态和宿主不再写这颗钮", () => {
    const block = dismissCss.match(/\.yohu-recipe-dismiss\s*\{[^}]+\}/);
    expect(block?.[0]).toContain("width: var(--yohu-layout-icon-sm)");
    expect(block?.[0]).toContain("height: var(--yohu-layout-icon-sm)");
    expect(block?.[0]).toContain("flex: 0 0 auto");
    expect(block?.[0]).toContain("border-radius: var(--yohu-radius-full)");
    expect(block?.[0]).toContain("background-color: var(--yohu-fg-2)");
    expect(block?.[0]).toContain("color: var(--yohu-surface)");
    expect(block?.[0]).toContain("position: relative");
    expect(block?.[0]).toContain("z-index: 1");
    expect(block?.[0]).not.toContain("position: absolute");
    expect(dismissCss).toContain(".yohu-recipe-dismiss:hover");
    expect(statesCss).not.toContain(".yohu-recipe-dismiss");
    expect(chipCss).not.toContain(".yohu-recipe-dismiss");
    expect(toastCss).not.toContain(".yohu-recipe-dismiss");
    expect(chipCss).not.toContain(".yohu-chip__remove");
    expect(chipCss).not.toContain("background-color: var(--yohu-fg-2)");
    expect(toastCss).not.toContain(".yohu-toast__close");
    expect(toastCss).not.toContain("background-color: var(--yohu-fg-2)");
  });

  it("幽灵清除由清除钮自己画，交互态和写入盒不再写这颗钮", () => {
    const block = clearCss.match(/\.yohu-recipe-clear\s*\{[^}]+\}/);
    expect(block?.[0]).toContain("background: transparent");
    expect(block?.[0]).toContain("color: var(--yohu-fg-3)");
    expect(block?.[0]).toContain("border-radius: var(--yohu-radius-sm)");
    expect(block?.[0]).toContain("var(--yohu-motion-effects-fast)");
    expect(clearCss).toContain(".yohu-recipe-clear:hover");
    expect(statesCss).not.toContain(".yohu-recipe-clear");
    expect(textFieldCss).not.toContain(".yohu-text-field__clear");
    expect(searchCss).not.toContain(".yohu-search__clear");
    expect(statesCss).not.toContain(".yohu-tabs__close");
  });
});
