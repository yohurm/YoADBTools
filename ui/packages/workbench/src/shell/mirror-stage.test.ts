import { describe, expect, it } from "vitest";
import { ModuleId } from "@yohu/api";

import { mirrorPresentShouldBeActive } from "./mirror-stage";

describe("mirrorPresentShouldBeActive", () => {
  it("只有投屏模块激活舞台", () => {
    expect(mirrorPresentShouldBeActive(ModuleId.Mirror)).toBe(true);
    expect(mirrorPresentShouldBeActive(ModuleId.Terminal)).toBe(false);
    expect(mirrorPresentShouldBeActive(undefined)).toBe(false);
  });
});
