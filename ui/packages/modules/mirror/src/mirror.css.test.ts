import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "mirror.css"), "utf-8");
const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "MirrorView.tsx"), "utf-8");

describe("mirror.css", () => {
  it("只锁栏宽，不点 YoPanel 内容区", () => {
    expect(css).toContain('.yohu-mirror__ops.yohu-panel[data-variant="pane"]');
    expect(css).toContain('.yohu-mirror__func.yohu-panel[data-variant="pane"]');
    expect(css).toContain("var(--yohu-layout-mirror-func)");
    expect(css).not.toContain("var(--yohu-layout-preview)");
    expect(css).not.toContain(".yohu-panel__body");
  });

  it("质量字段走 YoFormRow，不自写 caption 皮", () => {
    expect(css).not.toContain("yohu-mirror__field");
    expect(css).not.toMatch(/\.yohu-mirror__group\s*\{/);
    expect(css).not.toContain("justify-content: space-between");
    expect(view).toContain("YoFormRow");
    expect(view).toContain("reportAvail");
    expect(view).not.toContain("fitContain");
    expect(view).not.toContain("ipcMessage");
    expect(view).not.toContain("lastInsetKey");
    expect(view).toContain('YoBadge text="下次开始生效"');
    expect(view).not.toContain("YoTooltip");
  });
});
