import { describe, expect, it } from "vitest";

import { alreadyExistsText, invalidNameText, ENTRY_NAME_EMPTY, ENTRY_NAME_SEPARATOR } from "@yohu/api";

import {
  RENAME_FIELD_LABEL,
  RENAME_TITLE,
  renameDraftError,
  renameDraftReady,
  renameTakenPath,
} from "./rename";

describe("rename 草稿", () => {
  it("标题和字段名各一句", () => {
    expect(RENAME_TITLE).toBe("重命名");
    expect(RENAME_FIELD_LABEL).toBe("新名称");
  });

  it("占用只认同目录别的条目，源自身不算", () => {
    const names = ["a.txt", "b.txt"];
    expect(renameTakenPath(names, "/sdcard", "a.txt", "b.txt")).toBe("/sdcard/b.txt");
    expect(renameTakenPath(names, "/sdcard", "a.txt", "a.txt")).toBeNull();
    expect(renameTakenPath(names, "/sdcard", "a.txt", "c.txt")).toBeNull();
    expect(renameTakenPath(names, "/sdcard/DCIM", "a.txt", "b.txt")).toBe("/sdcard/DCIM/b.txt");
  });

  it("非法名与带分隔符的名不当成占用", () => {
    expect(renameTakenPath(["a/b"], "/sdcard", "a.txt", "a/b")).toBeNull();
    expect(renameTakenPath([".."], "/sdcard", "a.txt", "..")).toBeNull();
  });

  it("校验句与领域/core 同源", () => {
    expect(renameDraftError("  ", null)).toBe(invalidNameText(ENTRY_NAME_EMPTY));
    expect(renameDraftError("..", null)).toBe(invalidNameText(".."));
    expect(renameDraftError("a/b", null)).toBe(invalidNameText(ENTRY_NAME_SEPARATOR));
    expect(renameDraftError("b.txt", "/sdcard/b.txt")).toBe(alreadyExistsText("/sdcard/b.txt"));
    expect(renameDraftError("b.txt", null)).toBeNull();
  });

  it("名称未变化不可提交，但不出错句", () => {
    expect(renameDraftReady("a.txt", "a.txt", null)).toBe(false);
    expect(renameDraftReady(" a.txt ", "a.txt", null)).toBe(false);
    expect(renameDraftError(" a.txt ", null)).toBeNull();
    expect(renameDraftReady("b.txt", "a.txt", null)).toBe(true);
    expect(renameDraftReady("b.txt", "a.txt", "/sdcard/b.txt")).toBe(false);
    expect(renameDraftReady("", "a.txt", null)).toBe(false);
  });
});
