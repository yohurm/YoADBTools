import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  resolveSearchActive,
  resolveSearchOpen,
  resolveSearchSlot,
  resolveSearchWidth,
  searchHostAttrs,
  searchEntryPressed,
  searchHasQuery,
  searchShowClear,
  searchShowsBar,
  searchShowsEntry,
} from "./search-policy";

describe("search-policy", () => {
  it("缺省是栏、铺宽、开着、INPUT 清除", () => {
    expect(resolveSearchSlot()).toBe("bar");
    expect(searchShowsBar("bar")).toBe(true);
    expect(searchShowsEntry("bar")).toBe(false);
    expect(searchShowsEntry("both")).toBe(true);
    expect(resolveSearchWidth({ slot: "bar" })).toBe("fill");
    expect(resolveSearchWidth({ slot: "bar", block: false })).toBe("hug");
    expect(resolveSearchWidth({ slot: "entry" })).toBe("hug");
    expect(resolveSearchOpen({})).toBe(true);
    expect(resolveSearchOpen({ collapsible: true })).toBe(false);
    expect(resolveSearchOpen({ collapsible: true, open: true })).toBe(true);
    expect(searchShowClear({ value: "a" })).toBe(true);
    expect(searchShowClear({ value: "" })).toBe(false);
    expect(searchShowClear({ cancel: "constant", value: "" })).toBe(true);
    expect(searchShowClear({ cancel: "invisible", value: "a" })).toBe(false);
    expect(searchShowClear({ value: "a", disabled: true })).toBe(false);
    expect(resolveSearchActive({ value: "x" })).toBe(true);
    expect(resolveSearchActive({ value: "x", active: false })).toBe(false);
    expect(searchEntryPressed({ open: false, value: "adb" })).toBe(true);
    expect(searchEntryPressed({ open: true, value: "" })).toBe(true);
    expect(searchEntryPressed({ open: false, value: "" })).toBe(false);
    expect(searchHasQuery("adb")).toBe(true);
    expect(searchHasQuery("")).toBe(false);
    expect(searchHasQuery(undefined)).toBe(false);
    const owner = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "search-policy.ts"), "utf8")
      .replace('return slot === "both"', "")
      .replace('return slot === "entry"', "")
      .replace('return slot === "bar"', "")
      .replace('return cancel === "invisible"', "")
      .replace('return cancel === "constant"', "");
    expect(owner).not.toContain('=== "both"');
    expect(owner).not.toContain('=== "entry"');
    expect(owner).not.toContain('=== "bar"');
    expect(owner).not.toContain('=== "invisible"');
    expect(owner).not.toContain('=== "constant"');
  });

  it("宿主 data-* 与 error 无障碍", () => {
    expect(searchHostAttrs({})).toMatchObject({
      "data-slot": "bar",
      "data-open": "true",
      "data-width": "fill",
      "data-paint": "neutral",
      "data-status": "none",
      "data-active": undefined,
      "data-clearable": undefined,
    });
    const host = searchHostAttrs({
      slot: "entry",
      collapsible: true,
      open: true,
      value: "adb",
      status: "error",
    });
    expect(host["data-slot"]).toBe("entry");
    expect(host["data-collapsible"]).toBe("");
    expect(host["data-open"]).toBe("true");
    expect(host["data-clearable"]).toBe("");
    expect(host["data-paint"]).toBe("error");
    expect(host["aria-invalid"]).toBe(true);
    expect(host["data-width"]).toBe("hug");
  });
});
