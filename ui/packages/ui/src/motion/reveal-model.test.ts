import { describe, expect, it } from "vitest";

import { resolveRevealLayout } from "./reveal-model";
import { revealHostAttrs } from "./reveal-policy";

describe("reveal-model / policy", () => {
  it("开进流、关出流", () => {
    expect(resolveRevealLayout(true)).toBe("in");
    expect(resolveRevealLayout(false)).toBe("out");
  });

  it("写成 data-open / data-layout", () => {
    expect(revealHostAttrs(true)).toEqual({ "data-open": "true", "data-layout": "in" });
    expect(revealHostAttrs(false)).toEqual({ "data-open": "false", "data-layout": "out" });
  });
});
