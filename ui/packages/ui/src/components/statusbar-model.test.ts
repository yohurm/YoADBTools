import { describe, expect, it } from "vitest";
import { resolveStatusBarSpec } from "./statusbar-model";

describe("statusbar-model", () => {
  it("角色是 status，不是命令带", () => {
    expect(resolveStatusBarSpec()).toEqual({ role: "status" });
  });
});
