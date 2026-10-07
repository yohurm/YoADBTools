import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { formatByteCount } from "./byte-count";

function load(rel: string): string {
  const path = resolve(process.cwd(), rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("formatByteCount", () => {
  it("B / KB / MB / GB 同一阶梯", () => {
    expect(formatByteCount(512)).toBe("512 B");
    expect(formatByteCount(2048)).toBe("2.0 KB");
    expect(formatByteCount(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatByteCount(3 * 1024 * 1024 * 1024)).toBe("3.00 GB");
  });

  it("文件模块和更新对话框不再各写一阶", () => {
    const model = load("packages/modules/files/src/model.ts");
    const update = load("packages/workbench/src/settings/UpdateDialogs.tsx");
    expect(model).not.toContain("function formatSize");
    expect(update).not.toContain("function formatBytes");
    expect(update).toContain("formatByteCount");
  });
});
