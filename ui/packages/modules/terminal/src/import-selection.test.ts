import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { importAlreadyPresent, type ImportPreviewDto } from "@yohu/api";

import {
  IMPORT_ALREADY_IN_LIBRARY,
  defaultSelected,
  importCommitCount,
  importCommitText,
  importConfirmLabel,
  importGroupHasEntries,
  importOverviewText,
  importPreviewHasEntries,
  isAllChecked,
  isGroupChecked,
  toggleAll,
  toggleEntry,
  toggleGroup,
} from "./import-selection";

const preview: ImportPreviewDto = {
  groups: [
    {
      id: "g1",
      name: "已有组",
      presence: "existing",
      entries: [
        { id: "c1", name: "旧", kind: "command", presence: "existing" },
        { id: "c2", name: "新", kind: "command", presence: "new" },
      ],
    },
    {
      id: "g2",
      name: "新组",
      presence: "new",
      entries: [{ id: "b1", name: "块", kind: "block", presence: "new" }],
    },
  ],
};

describe("导入勾选", () => {
  it("已在库中只认 existing", () => {
    expect(importAlreadyPresent("existing")).toBe(true);
    expect(importAlreadyPresent("new")).toBe(false);
    expect(IMPORT_ALREADY_IN_LIBRARY).toBe("已在库中");
  });

  it("默认只勾新条目", () => {
    const selected = defaultSelected(preview);
    expect([...selected].sort()).toEqual(["b1", "c2"]);
    expect(isGroupChecked(preview.groups[0]!, selected)).toBe(false);
    expect(isGroupChecked(preview.groups[1]!, selected)).toBe(true);
    expect(isAllChecked(preview, selected)).toBe(false);
  });

  it("组勾选级联，部分勾选时组不显示为已选", () => {
    const selected = toggleGroup(preview.groups[0]!, defaultSelected(preview), true);
    expect(selected.has("c1")).toBe(true);
    expect(isGroupChecked(preview.groups[0]!, selected)).toBe(true);
    const partial = toggleEntry(selected, "c1", false);
    expect(isGroupChecked(preview.groups[0]!, partial)).toBe(false);
    expect(partial.has("c2")).toBe(true);
  });

  it("全选带上重复项，再关则清空", () => {
    const all = toggleAll(preview, true);
    expect(isAllChecked(preview, all)).toBe(true);
    expect(all.has("c1")).toBe(true);
    expect(toggleAll(preview, false).size).toBe(0);
  });

  it("摘要写出组数和将新增、覆盖", () => {
    expect(importOverviewText(preview)).toBe("2 组 · 3 条，其中 1 条已在库中");
    expect(importCommitText(preview, defaultSelected(preview))).toBe("将新增 2 条，覆盖 0 条");
    expect(importCommitText(preview, toggleAll(preview, true))).toBe("将新增 2 条，覆盖 1 条");
  });

  it("页脚按将提交的条数命名", () => {
    expect(importCommitCount({ add: 0, overwrite: 0 })).toBe(0);
    expect(importCommitCount({ add: 2, overwrite: 1 })).toBe(3);
    expect(importConfirmLabel({ add: 0, overwrite: 0 })).toBe("导入");
    expect(importConfirmLabel({ add: 2, overwrite: 1 })).toBe("导入 3 条");
  });

  it("空组没有条目，整份预览空则不能全选", () => {
    const empty = {
      id: "g0",
      name: "空",
      presence: "new" as const,
      entries: [],
    };
    expect(importGroupHasEntries(empty)).toBe(false);
    expect(isGroupChecked(empty, new Set())).toBe(false);
    expect(importPreviewHasEntries({ groups: [empty] })).toBe(false);
    expect(isAllChecked({ groups: [empty] }, new Set())).toBe(false);
    expect(importPreviewHasEntries(preview)).toBe(true);
    expect(importGroupHasEntries(preview.groups[0]!)).toBe(true);
  });
});

describe("导入条目和提交条数只各认一处", () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  it("对话框不再自己数条目", () => {
    const selection = readFileSync(join(dir, "import-selection.ts"), "utf8");
    const dialog = readFileSync(join(dir, "ImportDialog.tsx"), "utf8");
    const view = readFileSync(join(dir, "TerminalView.tsx"), "utf8");
    expect(selection.match(/entries\.length > 0/g)?.length ?? 0).toBe(1);
    expect(selection).not.toContain("entries.length === 0");
    expect(selection).not.toContain("ids.length > 0");
    expect(dialog).not.toContain("entries.length === 0");
    expect(dialog).not.toContain("entries.length > 0");
    expect(dialog).not.toContain("groups.every");
    expect(selection.match(/summary\.add \+ summary\.overwrite/g)?.length ?? 0).toBe(1);
    expect(view).not.toContain("summary.add + summary.overwrite");
  });
});

describe("导入失败只弹一次 errorText", () => {
  const dir = dirname(fileURLToPath(import.meta.url));

  it("import_error_text_once", () => {
    const view = readFileSync(join(dir, "TerminalView.tsx"), "utf8");
    const needle = "toaster.show(errorText(error), " + '"error")';
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("showErrorText(");
  });
});

describe("条目已在库中只判一次", () => {
  it("entry_already_present_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("importAlreadyPresent(" + "entry.presence)")).toBe(1);
    expect(times("function entryAlreadyPresent")).toBe(1);
    expect(times("export function entryAlreadyPresent")).toBe(0);
    expect(times("entryAlreadyPresent(entry)")).toBe(3);
  });
});

describe("勾选集合先复制再改", () => {
  it("copy_selection_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("new Set(" + "selected)")).toBe(1);
    expect(times("function copySelection")).toBe(1);
    expect(times("export function copySelection")).toBe(0);
    expect(times("copySelection(selected)")).toBe(2);
  });
});

describe("勾选开关写入集合只写一次", () => {
  it("set_chosen_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("if (on) next.add(" + "id)")).toBe(1);
    expect(times("next.add(" + "entry.id)")).toBe(0);
    expect(times("function setChosen")).toBe(1);
    expect(times("export function setChosen")).toBe(0);
    expect(times("setChosen(next")).toBe(3);
  });
});

describe("这条在勾选里只问一次", () => {
  it("entry_chosen_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("selected.has(" + "entry.id)")).toBe(1);
    expect(times("function entryChosen")).toBe(1);
    expect(times("export function entryChosen")).toBe(0);
    expect(times("entryChosen(selected, entry)")).toBe(2);
  });
});

describe("预览按组走一遍", () => {
  it("each_preview_group_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("for (const group of " + "preview.groups)")).toBe(1);
    expect(times("function eachPreviewGroup")).toBe(1);
    expect(times("export function eachPreviewGroup")).toBe(0);
    expect(times("eachPreviewGroup(preview")).toBe(3);
  });
});

describe("组内条目走一遍", () => {
  it("each_group_entry_once", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "import-selection.ts"), "utf8");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("for (const entry of " + "group.entries)")).toBe(1);
    expect(times("function eachGroupEntry")).toBe(1);
    expect(times("export function eachGroupEntry")).toBe(0);
    expect(times("eachGroupEntry(group")).toBe(4);
  });
});
