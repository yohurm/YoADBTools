import { describe, expect, it } from "vitest";

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

import { createCommandManagerStore } from "./store";

const sample: CommandLibraryDto = {
  schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
  groups: [
    {
      id: "g1",
      name: "设备信息",
      entries: [
        { kind: "command", id: "c1", name: "型号", template: "shell getprop ro.product.model" },
        { kind: "command", id: "c2", name: "电量", template: "shell dumpsys battery" },
        {
          kind: "block",
          id: "b1",
          name: "连上再看",
          gap_ms: 200,
          steps: [{ template: "wait-for-device" }, { template: "shell getprop ro.product.model" }],
        },
      ],
    },
    {
      id: "g2",
      name: "连接性",
      entries: [{ kind: "command", id: "c3", name: "WiFi", template: "shell dumpsys wifi" }],
    },
  ],
};

describe("命令管理 store", () => {
  it("load 深拷贝：改草稿不污染原库", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.updateGroupName("g1", "改过");
    expect(sample.groups[0]!.name).toBe("设备信息");
    expect(store.selectedGroup()?.name).toBe("改过");
  });

  it("多选删除按选区移除，块与命令一起删", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectEntry("c1", "replace");
    store.selectEntry("b1", "toggle");
    store.removeEntries();
    expect(store.selectedGroup()?.entries.map((e) => e.id)).toEqual(["c2"]);
    expect(store.ui.selectedEntryIds).toEqual(["c2"]);
  });

  it("复制候选按列表顺序只要命令", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectAllEntries();
    expect(store.selectedCommands().map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("toggle / range 走 YoUI nextKeys", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectEntry("c1", "replace");
    store.selectEntry("c2", "toggle");
    expect(store.ui.selectedEntryIds).toEqual(["c1", "c2"]);
    store.selectEntry("c1", "replace");
    store.selectEntry("b1", "range");
    expect(store.ui.selectedEntryIds).toEqual(["c1", "c2", "b1"]);
  });

  it("library() 提交形态含 schema 与 kind", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    const out = store.library();
    expect(out.schema_version).toBe(COMMAND_LIBRARY_SCHEMA_VERSION);
    expect(out.groups[0]!.entries.map((e) => e.kind)).toEqual(["command", "command", "block"]);
  });

  it("组与条目拖动换位，选中身份跟 id", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectGroup("g1");
    store.moveGroupTo(0, 1);
    expect(store.draft.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(store.ui.selectedGroupId).toBe("g1");
    store.moveGroupTo(1, 0);
    expect(store.draft.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    store.selectOnly("c1");
    store.moveEntryTo(0, 2);
    expect(store.selectedGroup()?.entries.map((e) => e.id)).toEqual(["c2", "b1", "c1"]);
    expect(store.ui.selectedEntryIds).toEqual(["c1"]);
    store.moveEntryTo(2, 1);
    expect(store.selectedGroup()?.entries.map((e) => e.id)).toEqual(["c2", "c1", "b1"]);
  });

  it("块步骤排序只改当前选中块", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectEntry("b1", "replace");
    store.moveBlockStepTo(0, 1);
    const block = store.selectedEntry();
    expect(block?.kind).toBe("block");
    if (block?.kind === "block") {
      expect(block.steps.map((s) => s.template)).toEqual([
        "shell getprop ro.product.model",
        "wait-for-device",
      ]);
    }
  });
});
