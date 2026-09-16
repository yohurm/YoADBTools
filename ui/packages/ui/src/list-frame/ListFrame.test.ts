import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ListFrame.css"), "utf-8");
const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ListFrame.tsx"), "utf-8");

describe("ListFrame", () => {
  it("叠加层走 YoCorner，不写 CSS border", () => {
    expect(view).toContain("YoCorner");
    expect(view).toContain("Radius.None");
    expect(view).toContain("box() != null");
    expect(view).not.toContain("<Show when={props.box()}>");
    expect(css).toContain("--yohu-corner-stroke: var(--yohu-accent)");
    expect(css).not.toContain("border:");
    expect(css).not.toContain("box-shadow");
    expect(css).not.toContain("yohu-list-row");
  });
});
