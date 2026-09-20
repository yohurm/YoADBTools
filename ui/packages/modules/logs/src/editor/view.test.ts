import { describe, expect, it } from "vitest";

describe("View 不回调 Formatter", () => {
  it("view 源文件不 import formatMessage，投影不在本文件", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "view.tsx"), "utf-8");
    expect(src).not.toMatch(/\bformatMessage\b/);
    expect(src).toContain("from \"./document\"");
    expect(src).toContain("from \"./board\"");
    expect(src).not.toContain("from \"./format\"");
    expect(src).not.toContain("wrapBody");
    expect(src).not.toContain("VisualBoard");
    expect(src).not.toContain("--yohu-log-hang");
    expect(src).not.toContain("--yohu-log-board");
    expect(src).toContain("LineBoard");
    expect(src).toContain("contentWidth");
    expect(src).toContain("LogLineLayout");
    expect(src).not.toContain("log_line_layout");
    expect(src).not.toContain("clipMessage");
    expect(src).not.toContain("wrapMessage");
    expect(src).not.toContain("documentLines");
  });
});
