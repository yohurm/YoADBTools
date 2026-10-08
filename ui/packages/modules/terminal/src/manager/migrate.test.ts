import { describe, expect, it } from "vitest";

import type { DraftEntry } from "../draft";
import {
  migrateArmed,
  migrateCarry,
  migrateDropId,
  migrateFrontId,
  migrateMenuId,
  migrateMenuTarget,
  migrateShouldFly,
  moveEntriesIntoGroup,
} from "./migrate";

const command = (id: string, name: string): DraftEntry => ({
  kind: "command",
  id,
  name,
  template: "shell echo",
  params: [],
});

const block = (id: string, name: string): DraftEntry => ({
  kind: "block",
  id,
  name,
  gap_ms: 0,
  steps: [{ id: "s", template: "shell echo", params: [] }],
});

describe("migrate", () => {
  const groups = [
    { id: "g1", entries: [command("c1", "型号"), command("c2", "电量"), block("b1", "连上再看")] },
    { id: "g2", entries: [command("c3", "WiFi")] },
  ];

  it("按源组顺序追加，命令和块一起走", () => {
    const moved = moveEntriesIntoGroup(groups, "g1", new Set(["b1", "c1"]), "g2");
    expect(moved?.moved.map((entry) => entry.id)).toEqual(["c1", "b1"]);
    expect(moved?.groups[0]?.entries.map((entry) => entry.id)).toEqual(["c2"]);
    expect(moved?.groups[1]?.entries.map((entry) => entry.id)).toEqual(["c3", "c1", "b1"]);
  });

  it("同一组、空选、未知组不动", () => {
    expect(moveEntriesIntoGroup(groups, "g1", new Set(["c1"]), "g1")).toBeNull();
    expect(moveEntriesIntoGroup(groups, "g1", new Set(), "g2")).toBeNull();
    expect(moveEntriesIntoGroup(groups, "g1", new Set(["c1"]), "g9")).toBeNull();
    expect(moveEntriesIntoGroup(groups, "g9", new Set(["c1"]), "g2")).toBeNull();
  });

  it("预览把抓起的那条放在最前，其余保持清单顺序", () => {
    const entries = groups[0]!.entries;
    const carry = migrateCarry(
      [...entries, command("c4", "第四"), command("c5", "")],
      new Set(["c5", "c2", "b1", "c4"]),
      "b1",
    );
    expect(carry?.count).toBe(4);
    expect(carry?.faces).toEqual([
      { id: "b1", label: "连上再看", leading: "block" },
      { id: "c2", label: "电量", leading: "terminal" },
      { id: "c4", label: "第四", leading: "terminal" },
      { id: "c5", label: "（未命名）", leading: "terminal" },
    ]);
    expect(migrateCarry(entries, new Set(["c2"]), "missing")?.faces[0]).toEqual({
      id: "c2",
      label: "电量",
      leading: "terminal",
    });
    expect(migrateCarry([...entries, command("c5", "")], new Set(["c5"]), "c5")?.faces[0]?.label).toBe("（未命名）");
    expect(migrateCarry(entries, new Set(["gone"]), "gone")).toBeNull();
  });

  it("落点只认其他组", () => {
    expect(migrateDropId(groups, "g1", "g2")).toBe("g2");
    expect(migrateDropId(groups, "g1", "g1")).toBeNull();
    expect(migrateDropId(groups, "g1", "c1")).toBeNull();
    expect(migrateDropId(groups, null, "g2")).toBeNull();
    expect(migrateFrontId(groups[0]!.entries, new Set(["c2", "b1"]))).toBe("c2");
  });

  it("臂距、菜单 id、重合不飞", () => {
    expect(migrateArmed({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toBe(true);
    expect(migrateArmed({ x: 0, y: 0 }, { x: 3, y: 4 }, 6)).toBe(false);
    expect(migrateMenuId("g2")).toBe("move:g2");
    expect(migrateMenuTarget("move:g2")).toBe("g2");
    expect(migrateMenuTarget("copy")).toBeNull();
    expect(migrateMenuTarget("move:")).toBeNull();
    expect(migrateShouldFly({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(false);
    expect(migrateShouldFly({ x: 0, y: 0 }, { x: 8, y: 0 })).toBe(true);
  });
});
