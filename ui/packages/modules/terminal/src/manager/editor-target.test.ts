import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { DraftBlock, DraftCommand, DraftGroup } from "../draft";
import {
  asBlock,
  asCommand,
  asGroup,
  editorPaneTitle,
  editorShowsForm,
  editorTarget,
  editorTargetIsGroup,
  draftRowTitle,
  multiCount,
} from "./editor-target";

const group: DraftGroup = { id: "g1", name: "设备信息", entries: [] };
const unnamed: DraftGroup = { id: "g2", name: "", entries: [] };
const command: DraftCommand = {
  kind: "command",
  id: "c1",
  name: "型号",
  template: "shell getprop",
  params: [],
};
const block: DraftBlock = {
  kind: "block",
  id: "b1",
  name: "连上再看",
  gap_ms: 200,
  steps: [{ id: "s1", template: "wait-for-device", params: [] }],
};

describe("editorTarget", () => {
  it("恰好一条命令 → command，标题带组名", () => {
    const target = editorTarget({ group, entry: command, selectedEntryCount: 1 });
    expect(target).toEqual({ kind: "command", command, groupName: "设备信息" });
    expect(editorPaneTitle(target)).toBe("命令属性 · 设备信息");
    expect(asCommand(target)).toBe(command);
    expect(asBlock(target)).toBeUndefined();
  });

  it("恰好一条命令块 → block；组名为空用未命名组", () => {
    const target = editorTarget({ group: unnamed, entry: block, selectedEntryCount: 1 });
    expect(target.kind).toBe("block");
    expect(asBlock(target)).toBe(block);
    expect(editorPaneTitle(target)).toBe("命令块 · 未命名组");
  });

  it("多选优先于组，不看 entry", () => {
    const target = editorTarget({ group, entry: undefined, selectedEntryCount: 3 });
    expect(target).toEqual({ kind: "multi", count: 3 });
    expect(multiCount(target)).toBe(3);
    expect(editorPaneTitle(target)).toBe("已选 3 条");
    expect(asGroup(target)).toBeUndefined();
  });

  it("只选组 → group", () => {
    const target = editorTarget({ group, entry: undefined, selectedEntryCount: 0 });
    expect(target).toEqual({ kind: "group", group });
    expect(asGroup(target)).toBe(group);
    expect(editorTargetIsGroup(target)).toBe(true);
    expect(editorPaneTitle(target)).toBe("组属性");
  });

  it("无组无条目 → empty", () => {
    const target = editorTarget({ group: undefined, entry: undefined, selectedEntryCount: 0 });
    expect(target).toEqual({ kind: "empty" });
    expect(editorPaneTitle(target)).toBeUndefined();
  });

  it("命令、块和组铺表单；空选和多选不铺", () => {
    expect(editorShowsForm(editorTarget({ group, entry: command, selectedEntryCount: 1 }))).toBe(true);
    expect(editorShowsForm(editorTarget({ group, entry: block, selectedEntryCount: 1 }))).toBe(true);
    expect(editorShowsForm(editorTarget({ group, entry: undefined, selectedEntryCount: 0 }))).toBe(true);
    expect(editorShowsForm(editorTarget({ group, entry: undefined, selectedEntryCount: 3 }))).toBe(false);
    expect(editorShowsForm(editorTarget({ group: undefined, entry: undefined, selectedEntryCount: 0 }))).toBe(false);
  });

  it("行标题空名用（未命名），有名原样", () => {
    expect(draftRowTitle("")).toBe("（未命名）");
    expect(draftRowTitle("设备信息")).toBe("设备信息");
  });
});

describe("编辑目标组只写一处", () => {
  it("生产源里只有 editorTargetIsGroup 比较 kind===group", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test.")) files.push(path);
      }
    };
    walk(root);
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const body = path.endsWith("editor-target.ts")
        ? text.replace('return target.kind === "group"', "").replace('return target.kind === "empty"', "")
        : text;
      expect(body, path).not.toContain('kind === "group"');
      expect(body, path).not.toContain('kind === "empty"');
    }
  });
});

describe("空名称回退只写一处", () => {
  it("name_or_fallback_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "editor-target.ts"), "utf8");
    expect(src.split("|| DRAFT_ROW_UNNAMED").length - 1).toBe(0);
    expect(src.split("|| UNNAMED_GROUP").length - 1).toBe(0);
    expect(src.split("return name || fallback").length - 1).toBe(1);
  });
});
