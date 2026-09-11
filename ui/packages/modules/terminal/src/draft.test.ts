import { describe, expect, it } from "vitest";

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

import { fromDraft, toDraft } from "./draft";

const sample: CommandLibraryDto = {
  schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
  groups: [
    {
      id: "g1",
      name: "设备信息",
      entries: [
        {
          kind: "command",
          id: "c1",
          name: "型号",
          template: "shell getprop ro.product.model",
        },
        {
          kind: "command",
          id: "c2",
          name: "ping",
          template: "shell ping -c 3 {0}",
        },
        {
          kind: "block",
          id: "b1",
          name: "连上再看型号",
          gap_ms: 500,
          steps: [{ template: "wait-for-device" }, { template: "shell getprop ro.product.model" }],
        },
      ],
    },
  ],
};

describe("命令管理草稿（DTO ↔ 草稿）", () => {
  it("toDraft → fromDraft 无损往返", () => {
    expect(fromDraft(toDraft(sample))).toEqual(sample);
  });

  it("toDraft 深拷贝：修改草稿不污染原库", () => {
    const draft = toDraft(sample);
    draft.groups[0]!.name = "被改过的名字";
    expect(sample.groups[0]!.name).toBe("设备信息");
  });

  it("组下命令与命令块同级往返", () => {
    const draft = toDraft(sample);
    expect(draft.groups[0]!.entries.map((e) => e.kind)).toEqual(["command", "command", "block"]);
    const block = draft.groups[0]!.entries[2];
    expect(block?.kind).toBe("block");
    if (block?.kind === "block") {
      expect(block.gap_ms).toBe(500);
      expect(block.steps).toHaveLength(2);
    }
  });
});
