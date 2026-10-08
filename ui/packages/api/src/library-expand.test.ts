import { describe, expect, it } from "vitest";

import {
  LIBRARY_EXPAND_CATALOG,
  LIBRARY_EXPAND_DEFAULT,
  isLibraryExpandMode,
  libraryExpandGroupIds,
  libraryExpandGroupsLabel,
  libraryExpandHasGroup,
  libraryExpandIsCollapsed,
  libraryExpandIsExpanded,
  libraryExpandIsGroups,
  libraryExpandWithGroup,
  libraryExpandWithMode,
} from "./library-expand";

describe("命令库默认展开", () => {
  it("产品默认全部折叠，三种模式各有一句文案", () => {
    expect(libraryExpandIsCollapsed(LIBRARY_EXPAND_DEFAULT)).toBe(true);
    expect(LIBRARY_EXPAND_DEFAULT.ids).toEqual([]);
    expect(LIBRARY_EXPAND_CATALOG.map((item) => item.value)).toEqual(["collapsed", "expanded", "groups"]);
    expect(LIBRARY_EXPAND_CATALOG.map((item) => item.label)).toEqual(["全部折叠", "全部展开", "指定命令组"]);
    expect(libraryExpandGroupsLabel()).toBe("指定命令组");
    expect(isLibraryExpandMode("collapsed")).toBe(true);
    expect(isLibraryExpandMode("all")).toBe(false);
  });

  it("投影：折叠忽略名单，展开打开全库，指定组取交集", () => {
    const groups = ["g-device", "g-power", "g-connect"];
    const picked = { mode: "groups" as const, ids: ["g-power", "missing"] };
    expect(libraryExpandGroupIds(LIBRARY_EXPAND_DEFAULT, groups)).toEqual([]);
    expect(libraryExpandGroupIds({ mode: "expanded", ids: ["g-power"] }, groups)).toEqual(groups);
    expect(libraryExpandGroupIds(picked, groups)).toEqual(["g-power"]);
    expect(libraryExpandIsExpanded({ mode: "expanded", ids: [] })).toBe(true);
    expect(libraryExpandIsGroups(picked)).toBe(true);
  });

  it("切模式保留 ids，勾选只改名单并回到指定组", () => {
    const policy = { mode: "collapsed" as const, ids: ["g-device"] };
    expect(libraryExpandWithMode(policy, "expanded")).toEqual({ mode: "expanded", ids: ["g-device"] });
    expect(policy.ids).toEqual(["g-device"]);
    const next = libraryExpandWithGroup(policy, "g-power", true);
    expect(next).toEqual({ mode: "groups", ids: ["g-device", "g-power"] });
    expect(libraryExpandWithGroup(next, "g-device", false).ids).toEqual(["g-power"]);
    expect(libraryExpandHasGroup(next, "g-device")).toBe(true);
    expect(libraryExpandWithGroup(next, "g-device", true).ids).toEqual(["g-device", "g-power"]);
  });
});
