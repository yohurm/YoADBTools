import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "OpsItem.css"), "utf-8");

describe("OpsItem.css", () => {
  it("在弹性槽里伸展，不用百分比高度撑行", () => {
    expect(css).toMatch(/\.yohu-ops-item\s*\{[^}]*flex:\s*1 1 auto;/);
    expect(css).toMatch(/\.yohu-ops-item\s*\{[^}]*min-height:\s*0;/);
    expect(css).not.toMatch(/\.yohu-ops-item\s*\{[^}]*height:\s*100%/);
  });
});
