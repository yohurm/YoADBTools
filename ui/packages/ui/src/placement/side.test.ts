import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { placementIsBottom } from "./side";

describe("浮层落点", () => {
  it("向下只判一次", () => {
    expect(placementIsBottom("bottom")).toBe(true);
    expect(placementIsBottom("top")).toBe(false);
  });

  it("bottom / top 只写在放置侧", () => {
    const ui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const files = [
      resolve(ui, "placement/side.ts"),
      resolve(ui, "overlay/popover-place.ts"),
      resolve(ui, "form/select-model.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("side.ts")) {
        body = body.replace('export type PopoverPlacement = "bottom" | "top";', "");
        body = body.replace('return placement === "bottom"', "");
      }
      expect(body, path).not.toContain('"bottom" | "top"');
      expect(body, path).not.toContain('=== "bottom"');
      expect(body, path).not.toContain('"start" | "end"');
    }
  });
});
