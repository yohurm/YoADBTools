import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "mirror.css"), "utf-8");
const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "MirrorView.tsx"), "utf-8");

describe("mirror.css", () => {
  it("只锁栏宽，不点 YoPanel 内容区", () => {
    expect(css).toContain(".yohu-mirror__ops {");
    expect(css).toContain(".yohu-mirror__func {");
    expect(css).not.toContain(".yohu-panel[data-variant");
    expect(css).toContain("var(--yohu-layout-mirror-func)");
    expect(css).not.toContain("var(--yohu-layout-preview)");
    expect(css).not.toContain(".yohu-panel__body");
    expect(css).not.toContain(".yohu-scroller__view");
    expect(css).toContain(".yohu-mirror__ops-stack");
    expect(css).not.toMatch(/overflow:\s*auto/);
    expect(css).not.toMatch(/overflow:\s*scroll/);
    expect(css).not.toMatch(/overflow-y:\s*auto/);
    expect(css).not.toMatch(/overflow-y:\s*scroll/);
  });

  it("质量栏纵排字段，禁止撑出底条", () => {
    expect(view).toContain('layout="stacked"');
    expect(css).not.toContain(".yohu-form-row");
    expect(css).not.toContain(".yohu-form-row__info");
    expect(css).not.toContain(".yohu-form-row__control");
    expect(view).toContain('overflow="hidden"');
    expect(view).not.toContain('align="start"');
    expect(view).toContain("YoScroller");
  });

  it("质量字段走 YoFormRow，不自写 caption 皮", () => {
    expect(css).not.toContain("yohu-mirror__field");
    expect(css).not.toContain("yohu-mirror__group-label");
    expect(css).not.toMatch(/\.yohu-mirror__group\s*\{/);
    expect(css).not.toContain("justify-content: space-between");
    expect(view).toContain("YoFormRow");
    expect(view).toContain('title="质量"');
    expect(view).toContain("reportAvail");
    expect(view).not.toContain("fitContain");
    expect(view).not.toContain("ipcMessage");
    expect(view).not.toContain("lastInsetKey");
    expect(view).toContain('YoBadge text="下次开始生效"');
    expect(view).not.toContain("YoTooltip");
    expect(view).not.toContain("deviceLabel");
  });
});
