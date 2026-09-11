import { describe, expect, it } from "vitest";

import type { DraftBlock, DraftCommand, DraftGroup } from "../draft";
import {
  asBlock,
  asCommand,
  asGroup,
  editorPaneTitle,
  editorTarget,
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
  steps: [{ id: "s1", template: "wait-for-device" }],
  params: [],
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
    expect(editorPaneTitle(target)).toBeUndefined();
    expect(asGroup(target)).toBeUndefined();
  });

  it("只选组 → group", () => {
    const target = editorTarget({ group, entry: undefined, selectedEntryCount: 0 });
    expect(target).toEqual({ kind: "group", group });
    expect(asGroup(target)).toBe(group);
    expect(editorPaneTitle(target)).toBe("组属性");
  });

  it("无组无条目 → empty", () => {
    const target = editorTarget({ group: undefined, entry: undefined, selectedEntryCount: 0 });
    expect(target).toEqual({ kind: "empty" });
    expect(editorPaneTitle(target)).toBeUndefined();
  });
});
