import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "mirror.css"), "utf-8");

describe("mirror.css", () => {
  it("只锁栏宽，不点 YoPanel 内容区", () => {
    expect(css).toContain('.yohu-mirror__ops.yohu-panel[data-variant="pane"]');
    expect(css).toContain('.yohu-mirror__func.yohu-panel[data-variant="pane"]');
    expect(css).not.toContain(".yohu-panel__body");
  });
});
