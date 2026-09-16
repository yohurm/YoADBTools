import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ListRow.css"), "utf-8");

describe("ListRow.css", () => {
  it("行盒只画格子，不画投放框", () => {
    expect(css).toMatch(/\.yohu-list-row \{[\s\S]*?border-radius:\s*var\(--yohu-radius-none\);/);
    expect(css).toMatch(/\[data-tone="list"\] \{\s*border-bottom:/);
    expect(css).toContain('[data-fill="selected"]');
    expect(css).toContain('[data-fill="hot"]');
    expect(css).toContain("var(--yohu-accent-soft)");
    expect(css).not.toContain("data-ring");
    expect(css).not.toContain("::after");
    expect(css).not.toContain(".yohu-focus-ring");
    expect(css).not.toContain("yohu-interactive");
    expect(css).not.toContain("var(--yohu-radius-sm)");
  });
});
