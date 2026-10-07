import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { logicalAxesHaveBlock, logicalAxesHaveInline, logicalAxisIsBlock } from "./axis";

describe("逻辑轴", () => {
  it("块向只判一次", () => {
    expect(logicalAxisIsBlock("block")).toBe(true);
    expect(logicalAxisIsBlock("inline")).toBe(false);
    expect(logicalAxesHaveBlock(["block"])).toBe(true);
    expect(logicalAxesHaveBlock(["inline"])).toBe(false);
    expect(logicalAxesHaveInline(["inline"])).toBe(true);
    expect(logicalAxesHaveInline(["block", "inline"])).toBe(true);
  });

  it("block / inline 只写在放置轴", () => {
    const ui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const files = [
      "placement/axis.ts",
      "motion/engines/travel/travel-model.ts",
      "motion/engines/rail/rail-slot.tsx",
      "scroll/scroller-binder.ts",
    ];
    for (const name of files) {
      let body = readFileSync(resolve(ui, name), "utf8");
      if (name.endsWith("axis.ts")) {
        body = body.replace('export type LogicalAxis = "block" | "inline";', "");
        body = body.replace('return axis === "block"', "");
      }
      expect(body, name).not.toContain('"block" | "inline"');
      expect(body, name).not.toContain("TravelAxis");
      expect(body, name).not.toContain("RailSlotAxis");
    }
  });

  it("行程不再用字符串认轴", () => {
    const ui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const files = [
      "motion/engines/travel/travel-model.ts",
      "motion/engines/travel/travel-policy.ts",
      "motion/engines/travel/travel-bind.ts",
    ];
    for (const name of files) {
      const body = readFileSync(resolve(ui, name), "utf8");
      expect(body, name).not.toContain('.includes("block")');
      expect(body, name).not.toContain('.includes("inline")');
    }
  });
});
