import { describe, expect, it } from "vitest";

import {
  resolveSearchActive,
  resolveSearchOpen,
  resolveSearchSlot,
  resolveSearchWidth,
  searchHostAttrs,
  searchEntryPressed,
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
    expect(host["data-collapsible"]).toBe(true);
    expect(host["data-open"]).toBe("true");
    expect(host["data-clearable"]).toBe(true);
    expect(host["data-paint"]).toBe("error");
    expect(host["aria-invalid"]).toBe(true);
    expect(host["data-width"]).toBe("hug");
  });
});
