import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { screenshotOutcomeIsFailed, screenshotOutcomeIsSaved } from "./screenshot";

describe("截图结果", () => {
  it("已保存与选路径失败各判一次", () => {
    expect(screenshotOutcomeIsSaved("saved")).toBe(true);
    expect(screenshotOutcomeIsFailed("failed")).toBe(true);
    expect(screenshotOutcomeIsSaved("cancelled")).toBe(false);
    expect(screenshotOutcomeIsFailed("cancelled")).toBe(false);
    expect(screenshotOutcomeIsSaved("failed")).toBe(false);
    expect(screenshotOutcomeIsFailed("saved")).toBe(false);
  });
});

describe("截图结果只在 screenshot 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("存储和视图不再比较 saved / failed / cancelled", () => {
    for (const name of ["screenshot.ts", "store.ts", "MirrorView.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return outcome === "saved"', "");
      body = body.replaceAll('return outcome === "failed"', "");
      expect(body, name).not.toContain('outcome === "saved"');
      expect(body, name).not.toContain('outcome === "failed"');
      expect(body, name).not.toContain('outcome === "cancelled"');
    }
  });
});
