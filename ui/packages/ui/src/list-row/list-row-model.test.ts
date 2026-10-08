import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  isListRowHot,
  listRowToneIsDocument,
  listRowToneIsList,
  resolveListRowChrome,
  resolveListRowRadius,
} from "./list-row-model";

describe("list-row-model", () => {
  it("缺省无底，半径 none", () => {
    expect(resolveListRowChrome({})).toEqual({ fill: "none", radius: "none" });
  });

  it("选中只填底", () => {
    expect(resolveListRowChrome({ selected: true })).toEqual({
      fill: "selected",
      radius: "none",
    });
  });

  it("热态盖过选中，只改底，不带环", () => {
    expect(resolveListRowChrome({ selected: true, hot: true })).toEqual({
      fill: "hot",
      radius: "none",
    });
  });

  it("document 可选单选：半径 chip，行自绘选中底", () => {
    expect(resolveListRowRadius({ selectable: true })).toBe("chip");
    expect(resolveListRowChrome({ selectable: true, selected: true })).toEqual({
      fill: "selected",
      radius: "chip",
    });
    expect(resolveListRowRadius({ selectable: true, selectedKeys: new Set(["only"]) })).toBe("chip");
  });

  it("list 或 document 多选块：直角通栏", () => {
    expect(resolveListRowRadius({ tone: "list", selectable: true })).toBe("none");
    expect(resolveListRowRadius({ selectable: true, selectedKeys: new Set(["a", "b"]) })).toBe(
      "none",
    );
    expect(resolveListRowChrome({ tone: "list", selectable: true, selected: true })).toEqual({
      fill: "selected",
      radius: "none",
    });
  });

  it("显式 chip：hairline 与多选仍是每项同一圆角", () => {
    expect(resolveListRowRadius({ tone: "list", selectable: true, radius: "chip" })).toBe("chip");
    expect(
      resolveListRowRadius({
        selectable: true,
        radius: "chip",
        selectedKeys: new Set(["a", "b"]),
      }),
    ).toBe("chip");
    expect(
      resolveListRowChrome({ tone: "list", selectable: true, selected: true, radius: "chip" }),
    ).toEqual({
      fill: "selected",
      radius: "chip",
    });
    expect(resolveListRowRadius({ radius: "chip" })).toBe("none");
  });

  it("热态按 key 精确命中", () => {
    expect(isListRowHot("docs", "docs")).toBe(true);
    expect(isListRowHot("docs", "other")).toBe(false);
    expect(isListRowHot("docs", null)).toBe(false);
    expect(isListRowHot("docs", undefined)).toBe(false);
    expect(isListRowHot(2, 2)).toBe(true);
    expect(isListRowHot(2, "2")).toBe(false);
  });

  it("半径：list 直角，document 可选单选 chip", () => {
    expect(resolveListRowRadius({ tone: "list", selectable: true })).toBe("none");
    expect(resolveListRowRadius({ selectable: true })).toBe("chip");
  });

  it("document / list 只在行模型里比较", () => {
    expect(listRowToneIsDocument("document")).toBe(true);
    expect(listRowToneIsDocument("list")).toBe(false);
    expect(listRowToneIsDocument(undefined)).toBe(false);
    expect(listRowToneIsList("list")).toBe(true);
    expect(listRowToneIsList("document")).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      "list-row-model.ts",
      "list-row-policy.ts",
      "ListRow.tsx",
      "../scroll/virtuallist-model.ts",
      "../scroll/virtuallist-policy.ts",
      "../scroll/VirtualList.tsx",
      "../grid/col-header-model.ts",
      "../grid/col-header-policy.ts",
      "../grid/ColHeader.tsx",
      "../grid/ColFrame.tsx",
      "../index.ts",
    ];
    for (const name of files) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "list-row-model.ts") {
        body = body.replace('return tone === "document"', "").replace('return tone === "list"', "");
      } else {
        expect(body, name).not.toContain('"document" | "list"');
        expect(body, name).not.toContain('"list" | "document"');
      }
      expect(body, name).not.toContain('=== "document"');
      expect(body, name).not.toContain('=== "list"');
      expect(body, name).not.toContain('!== "document"');
      expect(body, name).not.toContain('!== "list"');
      expect(body, name).not.toContain("YoVirtualListTone");
      expect(body, name).not.toContain("YoColHeaderTone");
      expect(body, name).not.toContain("YoColFrameTone");
    }
  });
});
