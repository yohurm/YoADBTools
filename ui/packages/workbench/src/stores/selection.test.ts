import { describe, expect, it } from "vitest";

import { reconcileFocus, resolveTargetSerials } from "@yohu/api";
import { reconcileFocus as shellReconcileFocus, resolveTargetSerials as shellResolveTargetSerials } from "./selection";

describe("selection", () => {
  it("壳只转发 @yohu/api 焦点规则", () => {
    expect(shellReconcileFocus).toBe(reconcileFocus);
    expect(shellResolveTargetSerials).toBe(resolveTargetSerials);
  });
});
