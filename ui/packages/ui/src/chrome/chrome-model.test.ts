import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromeHasBar, resolveChromeSpec } from "./chrome-model";

describe("chrome-model", () => {
  it("缺省无 leading、无栏、无次行、无 drop", () => {
    expect(resolveChromeSpec({})).toEqual({
      showLeading: false,
      showBar: false,
      showExtra: false,
      drop: undefined,
    });
  });

  it("hasLeading 与 dropIgnore 进规格", () => {
    expect(resolveChromeSpec({ hasLeading: true, dropIgnore: true })).toEqual({
      showLeading: true,
      showBar: false,
      showExtra: false,
      drop: "ignore",
    });
  });

  it("有动作才开功能栏，没有 layout", () => {
    expect(resolveChromeSpec({ actions: [{ key: "run" }], hasExtra: true })).toEqual({
      showLeading: false,
      showBar: true,
      showExtra: true,
      drop: undefined,
    });
    expect(resolveChromeSpec({ actions: [{ key: "run" }], hasExtra: true })).not.toHaveProperty("layout");
    expect(resolveChromeSpec({ actions: [] }).showBar).toBe(false);
  });

  it("功能栏只认有 key 的项", () => {
    expect(chromeHasBar(undefined)).toBe(false);
    expect(chromeHasBar([])).toBe(false);
    expect(chromeHasBar([{ key: "clear" }])).toBe(true);
  });

  it("视图不再自己数功能栏", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(join(here, "chrome.tsx"), "utf8");
    const policy = readFileSync(join(here, "chrome-policy.ts"), "utf8");
    expect(view).not.toContain("length ?? 0");
    expect(policy).not.toContain("length ?? 0");
    expect(view).not.toContain("hasBar");
    expect(view).not.toContain("if (next != null)");
  });
});
