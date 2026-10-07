import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("open 从关闭切快照，已打开再 open 不覆盖草稿", () => {
    const store = createCommandManagerStore();
    store.open(sample);
    expect(store.ui.open).toBe(true);
    store.updateGroupName("g1", "改过");
    store.open({
      ...sample,
      groups: [{ id: "g9", name: "新库", entries: [] }],
    });
    expect(store.selectedGroup()?.name).toBe("改过");
    expect(store.draft.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
  });

  it("requestClose 只关窗，finishClose 才丢草稿", () => {
    const store = createCommandManagerStore();
    store.open(sample);
    store.updateGroupName("g1", "改过");
    store.requestClose();
    expect(store.ui.open).toBe(false);
    expect(store.draft.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(store.selectedGroup()?.name).toBe("改过");
    store.finishClose();
    expect(store.draft.groups).toEqual([]);
    expect(store.ui.selectedGroupId).toBeNull();
    expect(store.ui.error).toBe("");
    store.open(sample);
    expect(store.ui.open).toBe(true);
    expect(store.selectedGroup()?.name).toBe("设备信息");
  });

  it("块步骤各自持有 {n} 与描述，换位带着走", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectEntry("b1", "replace");
    const block = () => {
      const entry = store.selectedEntry();
      if (entry?.kind !== "block") throw new Error("expected block");
      return entry;
    };
    const first = block().steps[0]!;
    const second = block().steps[1]!;
    store.updateBlockStep(first.id, "wait-for-device {0}");
    store.updateBlockStepParams(first.id, [{ index: 0, description: "等待" }]);
    store.updateBlockStep(second.id, "shell getprop {0}");
    store.updateBlockStepParams(second.id, [{ index: 0, description: "属性" }]);
    expect(block().steps.map((step) => step.template)).toEqual([
      "wait-for-device {0}",
      "shell getprop {0}",
    ]);
    expect(block().steps.map((step) => step.params)).toEqual([
      [{ index: 0, description: "等待" }],
      [{ index: 0, description: "属性" }],
    ]);
    store.moveBlockStepTo(0, 1);
    expect(block().steps.map((step) => step.template)).toEqual([
      "shell getprop {0}",
      "wait-for-device {0}",
    ]);
    expect(block().steps.map((step) => step.params)).toEqual([
      [{ index: 0, description: "属性" }],
      [{ index: 0, description: "等待" }],
    ]);
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

  it("选中块和选中组只各认一处", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    expect(src.match(/!entryIsBlock\(/g)?.length ?? 0).toBe(1);
    expect(src.match(/ui\.selectedGroupId/g)?.length ?? 0).toBe(1);
  });

  it("只剩一步时删不掉", () => {
    const store = createCommandManagerStore();
    store.load(sample);
    store.selectEntry("b1", "replace");
    expect(store.canRemoveBlockStep()).toBe(true);
    const entry = store.selectedEntry();
    if (entry?.kind !== "block") throw new Error("expected block");
    store.removeBlockStep(entry.steps[0]!.id);
    expect(store.canRemoveBlockStep()).toBe(false);
    const left = store.selectedEntry();
    if (left?.kind !== "block") throw new Error("expected block");
    store.removeBlockStep(left.steps[0]!.id);
    const stayed = store.selectedEntry();
    if (stayed?.kind !== "block") throw new Error("expected block");
    expect(stayed.steps).toHaveLength(1);
  });
});

describe("条目选区和块步骤只各认一处", () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  it("选区集合只构造一次，栏和菜单不再自己读数组", () => {
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const manager = readFileSync(resolve(dir, "../CommandManager.tsx"), "utf8");
    const editor = readFileSync(resolve(dir, "EditorColumn.tsx"), "utf8");
    expect(src.match(/ui\.selectedEntryIds/g)?.length ?? 0).toBe(1);
    expect(manager).not.toContain("selectedEntryIds.includes");
    expect(manager).not.toContain("ui.selectedEntryIds");
    expect(editor).not.toContain("selectedEntryIds.length");
    expect(editor).not.toContain("ui.selectedEntryIds");
  });

  it("步骤能不能删只在 store", () => {
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const steps = readFileSync(resolve(dir, "BlockSteps.tsx"), "utf8");
    expect(src.match(/steps\.length > 1/g)?.length ?? 0).toBe(1);
    expect(src).not.toContain("steps.length <= 1");
    expect(steps).not.toContain("entryIsBlock");
    expect(steps).not.toContain("steps.length");
  });
});

describe("删掉当前命令组只筛一次", () => {
  it("remove_group_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "g.id !== " + "gid";
    expect(src.split(needle).length - 1).toBe(1);
  });
});

describe("删掉选中的命令条目只筛一次", () => {
  it("remove_entries_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "!ids.has(" + "e.id)";
    expect(src.split(needle).length - 1).toBe(1);
  });
});

describe("追加条目只写一次", () => {
  it("append_entry_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    expect(src.split("[...es, " + "emptyCommand").length - 1).toBe(0);
    expect(src.split("[...es, " + "emptyBlock").length - 1).toBe(0);
    expect(src.split("[...es, " + "entry]").length - 1).toBe(1);
    expect(src).toContain("appendEntry(");
  });
});

describe("当前组条目改写只走一处", () => {
  it("write_group_entries_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    expect(src.split("if (!gid) " + "return;").length - 1).toBe(1);
    expect(src.split('"entries", ' + "next").length - 1).toBe(1);
    expect(src).toContain("writeGroupEntries(");
  });
});

describe("块步骤改写只走一处", () => {
  it("write_block_steps_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    expect(src.split("updateEntry({ " + "steps:").length - 1).toBe(1);
    expect(src.split("if (!entry) " + "return;").length - 1).toBe(1);
    expect(src).toContain("writeBlockSteps(");
  });
});

describe("编辑器选区复位只写一次", () => {
  it("replace_editor_ui_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "selectedEntryIds: " + "[],";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("replaceEditorUi(");
  });
});

describe("当前命令组条目编号只取一次", () => {
  it("group_entry_ids_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "entries.map((e) => " + "e.id)";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("groupEntryIds(");
  });
});

describe("写下条目选中编号和轴点只走一处", () => {
  it("write_selection_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const idsNeedle = "setUi(\"selected" + "EntryIds\"";
    const pivotNeedle = "setUi(\"entry" + "Pivot\"";
    expect(src.split(idsNeedle).length - 1).toBe(1);
    expect(src.split(pivotNeedle).length - 1).toBe(1);
    expect(src).toContain("writeSelection(");
  });
});

describe("名称输入只写进当前条目一次", () => {
  it("set_entry_name_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const command = readFileSync(resolve(dir, "CommandEditor.tsx"), "utf8");
    const block = readFileSync(resolve(dir, "BlockEditor.tsx"), "utf8");
    const needle = "updateEntry({ " + "name";
    expect(src.split(needle).length - 1).toBe(1);
    expect(command.split(needle).length - 1).toBe(0);
    expect(block.split(needle).length - 1).toBe(0);
    expect(command).toContain("setEntryName(");
    expect(block).toContain("setEntryName(");
  });
});

describe("可选对象没有 id 时当成 null", () => {
  it("id_or_null", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = ".id " + "?? null";
    expect(src.split(needle).length - 1).toBe(0);
    expect(src.split("idOrNull(").length - 1).toBe(5);
    expect(src).toContain("ui.entryPivot ?? ids[0] ?? null");
  });
});

describe("选中组条目没有组时当成空数组", () => {
  it("selected_entries_empty", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "?? " + "[]";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src.split("selectedEntries(").length - 1).toBe(4);
    expect(src).toContain("idOrNull(");
  });
});

describe("条目列向 store 取当前组条目", () => {
  it("entry_column_reads_selected_entries", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const column = readFileSync(resolve(dir, "EntryColumn.tsx"), "utf8");
    const needle = "?? " + "[]";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("selectedEntries,");
    expect(column).toContain("props.store.selectedEntries()");
    expect(column.split(needle).length - 1).toBe(0);
  });
});

describe("选中条目从选中组条目里找", () => {
  it("selected_entry_reads_selected_entries", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "store.ts"), "utf8");
    const needle = "selectedGroup()?.entries";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("selectedEntries().find((e) => e.id === ids[0])");
    expect(src).toContain("if (ids.length !== 1) return undefined");
  });
});

describe("是不是这一组只比一次", () => {
  it("group_is_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("g.id === " + "id")).toBe(1);
    expect(times("g.id === " + "gid")).toBe(0);
    expect(times("function groupIs")).toBe(1);
    expect(times("export function groupIs")).toBe(0);
    expect(times("groupIs(g, ")).toBe(4);
  });
});

describe("新增组沿用选中组", () => {
  it("add_group_selects_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "store.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('setUi("selectedGroupId", ' + "id);")).toBe(1);
    expect(times("selectOnly(" + "null)")).toBe(1);
    expect(times("selectGroup(id)")).toBe(1);
  });
});
