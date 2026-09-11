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

  it("质量字段拉满栏宽，不靠组容器均分高度", () => {
    expect(css).toMatch(/\.yohu-mirror__field\s*\{[^}]*width:\s*100%/);
    expect(css).not.toMatch(/\.yohu-mirror__group\s*\{/);
    expect(css).not.toContain("justify-content: space-between");
    expect(view).toContain('YoBadge text="下次开始生效"');
    expect(view).not.toContain("YoTooltip");
  });
});
