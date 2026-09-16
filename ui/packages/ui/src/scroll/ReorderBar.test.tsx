import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@solidjs/testing-library";

import { ReorderBar } from "./ReorderBar";

describe("ReorderBar", () => {
  it("只在 open 时挂 data-open，收回仍留在树上", () => {
    const { container } = render(() => <ReorderBar open={false} y={32} ready />);
    const bar = container.querySelector(".yohu-recipe-reorder-bar");
    expect(bar).toBeTruthy();
    expect(bar?.hasAttribute("data-open")).toBe(false);
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("配方两轴过渡走 motion token，禁止裸 ms", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ReorderBar.css"), "utf-8");
    expect(css).toContain("scaleX(0)");
    expect(css).toContain("scaleX(1)");
    expect(css).toContain("--yohu-motion-spatial-small");
    expect(css).toContain("--yohu-motion-effects-fast");
    expect(css).not.toMatch(/\d+ms/);
  });
});