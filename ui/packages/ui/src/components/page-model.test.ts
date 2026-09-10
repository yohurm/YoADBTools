import { describe, expect, it } from "vitest";
import { resolvePageSpec } from "./page-model";

describe("page-model", () => {
  it("页壳角色是 module", () => {
    expect(resolvePageSpec()).toEqual({ role: "module" });
  });
});
