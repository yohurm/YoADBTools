import { describe, expect, it } from "vitest";

import {
  libraryExpandKey,
  libraryGroupId,
  libraryGroupKey,
  nextLibraryOpenIds,
  toggleLibraryOpenId,
} from "./library-expand";

const groups = ["g-device", "g-power", "g-connect"];
const collapsed = { mode: "collapsed" as const, ids: ["g-power"] };
const expanded = { mode: "expanded" as const, ids: [] };
const picked = { mode: "groups" as const, ids: ["g-power", "missing"] };

describe("命令库停留开合", () => {
  it("组键往返，叶子键不是组", () => {
    expect(libraryGroupId(libraryGroupKey("g-device"))).toBe("g-device");
    expect(libraryGroupId("c:x")).toBeUndefined();
    expect(libraryGroupId("g:")).toBeUndefined();
  });

  it("策略变化按策略重铺，手动开合被盖掉", () => {
    const session = new Set(["g-device"]);
    expect([...nextLibraryOpenIds(session, groups, groups, collapsed, true)]).toEqual([]);
    expect([...nextLibraryOpenIds(session, groups, groups, expanded, true)]).toEqual(groups);
    expect([...nextLibraryOpenIds(session, groups, groups, picked, true)]).toEqual(["g-power"]);
  });

  it("策略不变时保留手动开合，新组按策略补", () => {
    const session = toggleLibraryOpenId(new Set(["g-power", "g-device"]), "g-power");
    expect(session.has("g-device")).toBe(true);
    expect(session.has("g-power")).toBe(false);
    const withNew = ["g-device", "g-power", "g-connect", "g-new"];
    const stayed = nextLibraryOpenIds(session, groups, withNew, expanded, false);
    expect(stayed.has("g-device")).toBe(true);
    expect(stayed.has("g-power")).toBe(false);
    expect(stayed.has("g-connect")).toBe(false);
    expect(stayed.has("g-new")).toBe(true);
    const folded = nextLibraryOpenIds(session, groups, withNew, collapsed, false);
    expect([...folded]).toEqual(["g-device"]);
    const chosen = nextLibraryOpenIds(new Set(), groups, withNew, picked, false);
    expect([...chosen]).toEqual([]);
    const chosenNew = nextLibraryOpenIds(new Set(), ["g-device"], ["g-device", "g-power"], picked, false);
    expect([...chosenNew]).toEqual(["g-power"]);
  });

  it("策略键含模式和名单", () => {
    expect(libraryExpandKey(collapsed)).not.toBe(libraryExpandKey({ ...collapsed, ids: [] }));
    expect(libraryExpandKey(collapsed)).not.toBe(libraryExpandKey(expanded));
  });
});