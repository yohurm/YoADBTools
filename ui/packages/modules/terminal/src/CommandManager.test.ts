import { describe, expect, it } from "vitest";

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

import { fromDraft, toDraft } from "./draft";

const sample: CommandLibraryDto = {
  schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
  groups: [
    {
      id: "g1",
      name: "设备信息",
      tags: ["产线", "调试"],
      commands: [
        {
          id: "c1",
          name: "型号",
          template: "shell getprop ro.product.model",
        },
        {
          id: "c2",
          name: "ping",
          template: "shell ping -c 3 {0}",
        },
      ],
    },
  ],
};

describe("命令管理 快照编辑（编辑即快照/全量提交/取消零污染）", () => {
  it("toDraft → fromDraft 无损往返", () => {
    const roundtrip = fromDraft(toDraft(sample));
    expect(roundtrip).toEqual(sample);
  });

  it("标签逗号拆分", () => {
    const draft = toDraft(sample);
    draft.groups[0]!.tagsText = "产线，调试";
    const out = fromDraft(draft);
    expect(out.groups[0]!.tags).toEqual(["产线", "调试"]);
  });

  it("toDraft 深拷贝：修改草稿不污染原库", () => {
    const draft = toDraft(sample);
    draft.groups[0]!.name = "被改过的名字";
    expect(sample.groups[0]!.name).toBe("设备信息");
  });
});
