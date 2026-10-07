import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formRowLayoutIsStacked,
  formRowPadIsFlush,
  hasFormRowSlot,
  resolveFormRowLayout,
  resolveFormRowPad,
  resolveFormRowSlots,
} from "./formrow-model";

describe("formrow-model", () => {
  it("缺省两槽皆空", () => {
    expect(resolveFormRowSlots({})).toEqual({ description: false, note: false });
  });

  it("空串与空白不算占槽", () => {
    expect(hasFormRowSlot("")).toBe(false);
    expect(hasFormRowSlot("   ")).toBe(false);
    expect(hasFormRowSlot(null)).toBe(false);
    expect(hasFormRowSlot(false)).toBe(false);
  });

  it("缺省横排，stacked 才纵排", () => {
    expect(resolveFormRowLayout()).toBe("row");
    expect(resolveFormRowLayout("row")).toBe("row");
    expect(resolveFormRowLayout("stacked")).toBe("stacked");
  });

  it("缺省 md 行垫，flush 才去垫", () => {
    expect(resolveFormRowPad()).toBe("md");
    expect(resolveFormRowPad("md")).toBe("md");
    expect(resolveFormRowPad("flush")).toBe("flush");
  });

  it("纵排和去垫只在模型里比较", () => {
    expect(formRowLayoutIsStacked("stacked")).toBe(true);
    expect(formRowLayoutIsStacked("row")).toBe(false);
    expect(formRowLayoutIsStacked()).toBe(false);
    expect(formRowPadIsFlush("flush")).toBe(true);
    expect(formRowPadIsFlush("md")).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/^formrow-.*\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const body =
        name === "formrow-model.ts"
          ? text.replace('return layout === "stacked"', "").replace('return pad === "flush"', "")
          : text;
      expect(body, name).not.toContain('=== "stacked"');
      expect(body, name).not.toContain('=== "flush"');
    }
  });

  it("非空说明与备注算占槽", () => {
    expect(hasFormRowSlot("跟随系统")).toBe(true);
    expect(resolveFormRowSlots({ description: "说明", note: "立即生效" })).toEqual({
      description: true,
      note: true,
    });
  });
});
