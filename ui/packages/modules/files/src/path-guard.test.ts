import { describe, expect, it } from "vitest";

import { guardBrowsePath } from "@yohu/api";
import { guardBrowsePath as moduleGuard } from "./path-guard";

describe("path-guard", () => {
  it("模块转发 @yohu/api", () => {
    expect(moduleGuard).toBe(guardBrowsePath);
  });
});
