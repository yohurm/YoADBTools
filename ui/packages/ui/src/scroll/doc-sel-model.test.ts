import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { docSelBandStyle } from "./doc-sel-model";

describe("docSelBandStyle", () => {
  it("left 就是文档偏移，不另加 hang 缩进", () => {
    expect(docSelBandStyle(3, 8)).toEqual({ left: "3ch", width: "8ch" });
    expect(docSelBandStyle(0, 10)).toEqual({ left: "0ch", width: "10ch" });
    expect(docSelBandStyle(2, 4)).toEqual({ left: "2ch", width: "4ch" });
  });

  it("负值收成 0", () => {
    expect(docSelBandStyle(-2, -1)).toEqual({ left: "0ch", width: "0ch" });
  });

  it("带色走 token，垫在字下，不接指针", () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "doc-sel.css"), "utf-8");
    expect(css).toContain("var(--yohu-doc-sel)");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("z-index: -1");
    expect(css).not.toContain("::selection");
  });
});
