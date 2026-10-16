import { describe, expect, it, vi } from "vitest";

import { createKindTitle } from "./create-kind";
import { filesListMenu } from "./menu";
import { RENAME_TITLE } from "./rename";

describe("filesListMenu", () => {
  it("无选中时下载/复制/重命名/删除禁用", () => {
    const items = filesListMenu.items({
      canDownload: false,
      canDelete: false,
      canCopy: false,
      canRename: false,
      newFile: () => undefined,
      newDir: () => undefined,
      download: () => undefined,
      copy: () => undefined,
      rename: () => undefined,
      remove: () => undefined,
    });
    expect(items.map((item) => item.id)).toEqual([
      "new-file",
      "new-dir",
      "download",
      "copy",
      "rename",
      "delete",
    ]);
    expect(items.find((item) => item.id === "new-file")?.label).toBe(createKindTitle("file"));
    expect(items.find((item) => item.id === "new-dir")?.label).toBe(createKindTitle("dir"));
    expect(items.find((item) => item.id === "rename")?.label).toBe(RENAME_TITLE);
    expect(items.find((item) => item.id === "delete")?.danger).toBe(true);
  });

  it("单选一行才放开重命名", () => {
    const ctx = {
      canDownload: false,
      canDelete: true,
      canCopy: true,
      canRename: true,
      newFile: () => undefined,
      newDir: () => undefined,
      download: () => undefined,
      copy: () => undefined,
      rename: () => undefined,
      remove: () => undefined,
    };
    expect(filesListMenu.items(ctx).find((item) => item.id === "rename")?.disabled).toBe(false);
    expect(
      filesListMenu.items({ ...ctx, canRename: false }).find((item) => item.id === "rename")
        ?.disabled,
    ).toBe(true);
  });

  it("onSelect 分发给对应 ctx 动作", () => {
    const copy = vi.fn();
    const rename = vi.fn();
    const ctx = {
      canDownload: true,
      canDelete: true,
      canCopy: true,
      canRename: true,
      newFile: vi.fn(),
      newDir: vi.fn(),
      download: vi.fn(),
      copy,
      rename,
      remove: vi.fn(),
    };
    filesListMenu.onSelect("copy", ctx);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(ctx.remove).not.toHaveBeenCalled();
    filesListMenu.onSelect("rename", ctx);
    expect(rename).toHaveBeenCalledTimes(1);
    expect(ctx.remove).not.toHaveBeenCalled();
  });
});
