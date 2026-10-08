import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

  it("参数描述往返，空说明不落盘", () => {
    const withParams: CommandLibraryDto = {
      ...sample,
      groups: [
        {
          ...sample.groups[0]!,
          entries: [
            {
              kind: "command",
              id: "c2",
              name: "ping",
              template: "shell ping -c 3 {0}",
              params: [{ index: 0, description: "主机" }],
            },
          ],
        },
      ],
    };
    expect(fromDraft(toDraft(withParams))).toEqual(withParams);
    const draft = toDraft(withParams);
    if (draft.groups[0]!.entries[0]!.kind === "command") {
      draft.groups[0]!.entries[0]!.params = [
        { index: 0, description: "主机" },
        { index: 1, description: "多余" },
      ];
    }
    expect(fromDraft(draft).groups[0]!.entries[0]).toMatchObject({
      params: [{ index: 0, description: "主机" }],
    });
  });

  it("步骤参数描述往返，块级旧 params 不进草稿", () => {
    const withStepParams: CommandLibraryDto = {
      ...sample,
      groups: [
        {
          ...sample.groups[0]!,
          entries: [
            {
              kind: "block",
              id: "b1",
              name: "连上再看型号",
              gap_ms: 500,
              steps: [
                { template: "wait-for-device {0}", params: [{ index: 0, description: "等待" }] },
                { template: "shell getprop {0}", params: [{ index: 0, description: "属性" }] },
              ],
            },
          ],
        },
      ],
    };
    expect(fromDraft(toDraft(withStepParams))).toEqual(withStepParams);
    const draft = toDraft(withStepParams);
    const block = draft.groups[0]!.entries[0];
    expect(block?.kind).toBe("block");
    if (block?.kind === "block") {
      expect(block).not.toHaveProperty("params");
      expect(block.steps.map((step) => step.params)).toEqual([
        [{ index: 0, description: "等待" }],
        [{ index: 0, description: "属性" }],
      ]);
    }
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

describe("空参数不落盘只判一次", () => {
  it("命令和步骤不再各自看参数长度", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "draft.ts"), "utf8");
    expect(src).not.toContain("params.length > 0");
    expect(src.match(/aligned\.length > 0/g)?.length ?? 0).toBe(1);
  });
});

describe("草稿缺省参数只兜一次", () => {
  it("draft_params_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const needle = "params " + "?? []";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("draftParams(");
  });
});

describe("条目编号和名称原样只带走一次", () => {
  it("entry_identity_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const idNeedle = "id: " + "entry.id";
    const nameNeedle = "name: " + "entry.name";
    expect(src.split(idNeedle).length - 1).toBe(1);
    expect(src.split(nameNeedle).length - 1).toBe(1);
    expect(src).toContain("entryIdentity(");
  });
});

describe("新建空白模板只写一次", () => {
  it("blank_template_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const templateNeedle = "template: " + '""';
    const paramsNeedle = "params: " + "[]";
    expect(src.split(templateNeedle).length - 1).toBe(1);
    expect(src.split(paramsNeedle).length - 1).toBe(1);
    expect(src).toContain("blankTemplate(");
  });
});

describe("新建时名称是空字符串只写一次", () => {
  it("blank_name_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const needle = "name: " + '""';
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("blankName(");
  });
});

describe("命令组编号和名称原样只带走一次", () => {
  it("group_identity_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const idNeedle = "id: " + "g.id";
    const nameNeedle = "name: " + "g.name";
    const ownerNeedle = "id: " + "group.id";
    expect(src.split(idNeedle).length - 1).toBe(0);
    expect(src.split(nameNeedle).length - 1).toBe(0);
    expect(src.split(ownerNeedle).length - 1).toBe(1);
    expect(src).toContain("groupIdentity(");
  });
});

describe("命令块间隔原样只带走一次", () => {
  it("block_gap_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "draft.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("gap_ms: " + "entry.gap_ms")).toBe(1);
    expect(times("function blockGap")).toBe(1);
    expect(times("export function blockGap")).toBe(0);
    expect(times("...blockGap(entry)")).toBe(2);
  });
});

describe("命令库版本只盖一次", () => {
  it("library_schema_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(dir, "draft.ts"), "utf8");
    const store = readFileSync(resolve(dir, "store.ts"), "utf8");
    const times = (text: string, needle: string) => text.split(needle).length - 1;
    const needle = "schema_version: " + "COMMAND_LIBRARY_SCHEMA_VERSION";
    expect(times(src, needle)).toBe(1);
    expect(times(store, needle)).toBe(0);
    expect(times(src, "function librarySchema")).toBe(1);
    expect(times(src, "export function librarySchema")).toBe(0);
    expect(src).toContain("...librarySchema()");
    expect(store).toContain("fromDraft({ groups: [] })");
  });
});
