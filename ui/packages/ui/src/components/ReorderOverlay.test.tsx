import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@solidjs/testing-library";

import { ReorderOverlay } from "./ReorderOverlay";

describe("ReorderOverlay", () => {
  it("只在 open 时挂 data-open，副本不接收指针", () => {
    const { container } = render(() => (
      <ReorderOverlay open={false} y={8} height={32} ready>
        <span>row</span>
      </ReorderOverlay>
    ));
    const overlay = container.querySelector(".yohu-recipe-reorder-overlay");
    expect(overlay).toBeTruthy();
    expect(overlay?.hasAttribute("data-open")).toBe(false);
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
  });

  it("配方开合走 token，top 不过渡", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ReorderOverlay.css"), "utf-8");
    expect(css).toContain("--yohu-shadow-overlay");
    expect(css).toContain("--yohu-motion-effects-fast");
    expect(css).not.toMatch(/top\s+var\(--yohu-motion/);
    expect(css).not.toMatch(/\d+ms/);
  });
});
