import { describe, expect, it } from "vitest";

import {
  edgeEnabledIndex,
  enabledMenuIndexes,
  stepEnabledIndex,
  typeaheadMatchIndex,
} from "./menu-list-model";

const ITEMS = [
  { label: "复制" },
  { label: "重命名", disabled: true },
  { label: "删除" },
  { label: "导出" },
];

describe("menu-list-model", () => {
  it("跳过禁用项", () => {
    expect(enabledMenuIndexes(ITEMS)).toEqual([0, 2, 3]);
  });

  it("箭头在可选项间循环", () => {
    expect(stepEnabledIndex([0, 2, 3], 0, 1)).toBe(2);
    expect(stepEnabledIndex([0, 2, 3], 3, 1)).toBe(0);
    expect(stepEnabledIndex([0, 2, 3], 0, -1)).toBe(3);
    expect(stepEnabledIndex([], 0, 1)).toBeNull();
  });

  it("Home/End 落在可用首尾", () => {
    expect(edgeEnabledIndex([0, 2, 3], "start")).toBe(0);
    expect(edgeEnabledIndex([0, 2, 3], "end")).toBe(3);
  });

  it("typeahead 按前缀命中，同字连按循环", () => {
    expect(typeaheadMatchIndex(ITEMS, "删", 0)).toBe(2);
    expect(typeaheadMatchIndex(ITEMS, "d", 0)).toBeNull();
    const same = [
      { label: "Copy" },
      { label: "Cut" },
      { label: "Close" },
    ];
    expect(typeaheadMatchIndex(same, "c", 0)).toBe(0);
    expect(typeaheadMatchIndex(same, "cc", 0)).toBe(1);
    expect(typeaheadMatchIndex(same, "cl", 0)).toBe(2);
  });
});
