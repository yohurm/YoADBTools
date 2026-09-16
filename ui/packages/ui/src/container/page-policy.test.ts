import { describe, expect, it } from "vitest";
import { pageHostAttrs } from "./page-policy";

describe("page-policy", () => {
  it("宿主标记 module 角色", () => {
    expect(pageHostAttrs()).toEqual({ "data-role": "module" });
  });
});
