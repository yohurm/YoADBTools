import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  pageColumnForRole,
  pageColumnIsMeasure,
  pagePadForRole,
  pagePadIsMargin,
  pageRoleIsSettings,
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

  it("设置页、页垫和列帽只各比一次", () => {
    expect(pageRoleIsSettings("settings")).toBe(true);
    expect(pageRoleIsSettings("module")).toBe(false);
    expect(pageRoleIsSettings()).toBe(false);
    expect(pagePadIsMargin("margin")).toBe(true);
    expect(pagePadIsMargin("inset")).toBe(false);
    expect(pageColumnIsMeasure("measure")).toBe(true);
    expect(pageColumnIsMeasure("fill")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["page-model.ts", "page-policy.ts", "Page.tsx"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "page-model.ts") {
        body = body
          .replace('return role === "settings"', "")
          .replace('return pad === "margin"', "")
          .replace('return column === "measure"', "");
      }
      expect(body, name).not.toContain('=== "settings"');
      expect(body, name).not.toContain('=== "margin"');
      expect(body, name).not.toContain('=== "measure"');
    }
  });
});
