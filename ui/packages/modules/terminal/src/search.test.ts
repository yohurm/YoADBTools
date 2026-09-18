import { describe, expect, it } from "vitest";

import type { CommandGroupDto } from "@yohu/api";

import { entryMatchesQuery, filterLibraryGroups, normalizeSearchQuery } from "./search";

const groups: CommandGroupDto[] = [
  {
    id: "g-device",
    name: "设备信息",
    entries: [
      { kind: "command", id: "c-model", name: "型号", template: "shell getprop ro.product.model" },
      { kind: "command", id: "c-ping", name: "网络连通性", template: "shell ping -c 3 {0}" },
    ],
  },
  {
    id: "g-power",
    name: "电源",
    entries: [
      {
        kind: "block",
        id: "b-wake",
        name: "连上再亮",
        gap_ms: 200,
        steps: [{ template: "wait-for-device" }, { template: "shell input keyevent 224" }],
      },
    ],
  },
];

describe("命令库检索", () => {
  it("空查询原样返回", () => {
    expect(normalizeSearchQuery("  ")).toBe("");
    expect(filterLibraryGroups(groups, "   ")).toEqual(groups);
  });

  it("叶子名 / 模板 / 步骤命中，组名命中保留整组", () => {
    expect(entryMatchesQuery(groups[0]!.entries[0]!, "型号")).toBe(true);
    expect(entryMatchesQuery(groups[0]!.entries[0]!, "getprop")).toBe(true);
    expect(entryMatchesQuery(groups[1]!.entries[0]!, "keyevent")).toBe(true);
    expect(entryMatchesQuery(groups[0]!.entries[0]!, "wifi")).toBe(false);
    expect(filterLibraryGroups(groups, "PING").map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["c-ping"],
    ]);
    expect(filterLibraryGroups(groups, "设备").map((group) => group.id)).toEqual(["g-device"]);
    expect(filterLibraryGroups(groups, "设备")[0]?.entries).toHaveLength(2);
    expect(filterLibraryGroups(groups, "shell ping").map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["c-ping"],
    ]);
  });

  it("无命中为空数组", () => {
    expect(filterLibraryGroups(groups, "不存在的词")).toEqual([]);
  });

  it("拼音全拼 / 首字母命中中文名与组名", () => {
    expect(entryMatchesQuery(groups[0]!.entries[0]!, "xh")).toBe(true);
    expect(entryMatchesQuery(groups[0]!.entries[0]!, "xinghao")).toBe(true);
    expect(filterLibraryGroups(groups, "shebei").map((group) => group.id)).toEqual(["g-device"]);
    expect(filterLibraryGroups(groups, "lszl").map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["b-wake"],
    ]);
    expect(filterLibraryGroups(groups, "wlltx").map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ["c-ping"],
    ]);
  });
});
