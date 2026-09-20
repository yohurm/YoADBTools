import { describe, expect, it } from "vitest";
import {
  pageColumnForRole,
  pagePadForRole,
  resolvePageRole,
  resolvePageSpec,
} from "./page-model";

describe("page-model", () => {
  it("缺省效率型：inset 垫、列铺满", () => {
    expect(resolvePageRole()).toBe("module");
    expect(resolvePageSpec()).toEqual({ role: "module", pad: "inset", column: "fill" });
    expect(pagePadForRole("module")).toBe("inset");
    expect(pageColumnForRole("module")).toBe("fill");
  });

  it("设置页：左右 page-margin，列帽走阅读列", () => {
    expect(resolvePageRole("settings")).toBe("settings");
    expect(resolvePageSpec("settings")).toEqual({
      role: "settings",
      pad: "margin",
      column: "measure",
    });
    expect(pagePadForRole("settings")).toBe("margin");
    expect(pageColumnForRole("settings")).toBe("measure");
  });
});
