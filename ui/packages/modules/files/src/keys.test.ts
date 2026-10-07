import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { matchBindings, type PanelKeyContext } from "@yohu/ui";

import {
  copyRemotePaths,
  FILES_KEY_BINDINGS,
  filesKeyIsCopy,
  filesKeyIsDelete,
  filesKeyIsEditPath,
  filesKeyIsGoUp,
  filesKeyIsOpen,
  filesKeyIsRefresh,
  filesKeyIsSelectAll,
} from "./keys";

function keyEvent(init: Pick<KeyboardEventInit, "key" | "ctrlKey">): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("FILES_KEY_BINDINGS", () => {
  const ctx = (over: Partial<PanelKeyContext> = {}): PanelKeyContext => ({
    inPanel: true,
    inList: false,
    inEditable: false,
    inDialog: false,
    inShell: false,
    inActionable: false,
    ...over,
  });
  const list = ctx({ inList: true });
  const field = ctx({ inEditable: true });
  const chrome = ctx();
  const rail = ctx({ inPanel: false });

  it("列表 Ctrl+A/C、Delete、Enter、Backspace；F5 / Ctrl+L 在面板铬；输入框与侧栏不生效", () => {
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), list, FILES_KEY_BINDINGS)).toBe("select-all");
    expect(matchBindings(keyEvent({ key: "c", ctrlKey: true }), list, FILES_KEY_BINDINGS)).toBe("copy");
    expect(matchBindings(keyEvent({ key: "Delete" }), list, FILES_KEY_BINDINGS)).toBe("delete");
    expect(matchBindings(keyEvent({ key: "Enter" }), list, FILES_KEY_BINDINGS)).toBe("open");
    expect(matchBindings(keyEvent({ key: "Backspace" }), list, FILES_KEY_BINDINGS)).toBe("go-up");
    expect(matchBindings(keyEvent({ key: "F5" }), chrome, FILES_KEY_BINDINGS)).toBe("refresh");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), chrome, FILES_KEY_BINDINGS)).toBe("edit-path");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), list, FILES_KEY_BINDINGS)).toBe("edit-path");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), field, FILES_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), field, FILES_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "Delete" }), field, FILES_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), rail, FILES_KEY_BINDINGS)).toBeNull();
  });
});

describe("copyRemotePaths", () => {
  it("拼当前目录下的远程绝对路径", () => {
    expect(copyRemotePaths("/sdcard", ["a.txt", "DCIM"])).toBe("/sdcard/a.txt\n/sdcard/DCIM");
  });
});

describe("文件快捷键只在 keys 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const actions = ["select-all", "copy", "delete", "refresh", "go-up", "edit-path", "open"];

  it("每种动作只判一次，视图不再比较字面量", () => {
    expect(filesKeyIsSelectAll("select-all")).toBe(true);
    expect(filesKeyIsCopy("copy")).toBe(true);
    expect(filesKeyIsDelete("delete")).toBe(true);
    expect(filesKeyIsRefresh("refresh")).toBe(true);
    expect(filesKeyIsGoUp("go-up")).toBe(true);
    expect(filesKeyIsEditPath("edit-path")).toBe(true);
    expect(filesKeyIsOpen("open")).toBe(true);
    expect(filesKeyIsOpen("copy")).toBe(false);
    for (const name of ["keys.ts", "FileView.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      for (const action of actions) {
        body = body.replaceAll(`return action === "${action}"`, "");
        expect(body, name).not.toContain(`action === "${action}"`);
      }
    }
  });

  it("上传和下载不再各判一次选择器失败", () => {
    const view = readFileSync(join(root, "FileView.tsx"), "utf8");
    expect(view).not.toContain("dialogPickFailed(selected)");
    expect(view).not.toContain("dialogPickFailed(dest)");
    expect(view).not.toContain("if (!selected.ok) return");
    expect(view).toContain("hostPathFromPick");
  });

  it("delete_selection_once", () => {
    const view = readFileSync(join(root, "FileView.tsx"), "utf8");
    const needle = "deleteDialog?.ask([" + "...listingStore.selectionNames()])";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("askDeleteSelection(");
  });

  it("refresh_listing_once", () => {
    const view = readFileSync(join(root, "FileView.tsx"), "utf8");
    const needle = "listingStore." + "refresh";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("refreshListing(");
  });
});
