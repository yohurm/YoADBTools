import { describe, expect, it, vi } from "vitest";

import { createKindTitle } from "./create-kind";
import { filesListMenu } from "./menu";

describe("filesListMenu", () => {
  it("无选中时下载/复制/删除禁用", () => {
    const items = filesListMenu.items({
      canDownload: false,
      canDelete: false,
      canCopy: false,
      newFile: () => undefined,
      newDir: () => undefined,
      download: () => undefined,
      copy: () => undefined,
      remove: () => undefined,
    });
    expect(items.map((item) => item.id)).toEqual(["new-file", "new-dir", "download", "copy", "delete"]);
    expect(items.find((item) => item.id === "new-file")?.label).toBe(createKindTitle("file"));
    expect(items.find((item) => item.id === "new-dir")?.label).toBe(createKindTitle("dir"));
    expect(items.find((item) => item.id === "delete")?.danger).toBe(true);
  });

  it("onSelect 分发给对应 ctx 动作", () => {
    const copy = vi.fn();
    const ctx = {
      canDownload: true,
      canDelete: true,
      canCopy: true,
      newFile: vi.fn(),
      newDir: vi.fn(),
      download: vi.fn(),
      copy,
      remove: vi.fn(),
    };
    filesListMenu.onSelect("copy", ctx);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(ctx.remove).not.toHaveBeenCalled();
  });
});
