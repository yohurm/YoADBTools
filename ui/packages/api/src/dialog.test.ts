import { describe, expect, it, vi, beforeEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dialog = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => dialog.open(...args),
  save: (...args: unknown[]) => dialog.save(...args),
}));

import { DIALOG_FAILED, dialogOpenFile, dialogPickFailed, dialogSaveFile } from "./dialog";

beforeEach(() => {
  dialog.open.mockReset();
  dialog.save.mockReset();
});

describe("文件选择器", () => {
  it("选中路径、取消、打不开是三种结果", async () => {
    dialog.open.mockResolvedValue("/tmp/a.bin");
    expect(await dialogOpenFile({ title: "选择" })).toEqual({ ok: true, path: "/tmp/a.bin" });

    dialog.open.mockResolvedValue(null);
    expect(await dialogOpenFile()).toEqual({ ok: false, reason: "cancelled" });

    dialog.save.mockRejectedValue(new Error("plugin"));
    expect(await dialogSaveFile()).toEqual({ ok: false, reason: "failed" });
    expect(DIALOG_FAILED).toBe("无法打开文件选择器");
    expect(dialogPickFailed({ ok: false, reason: "failed" })).toBe(true);
    expect(dialogPickFailed({ ok: false, reason: "cancelled" })).toBe(false);
    expect(dialogPickFailed({ ok: true, path: "/tmp/a.bin" })).toBe(false);
  });
});

describe("选择器失败只写一处", () => {
  it("模块不各自比较 reason===failed", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === "node_modules") continue;
          walk(path);
          continue;
        }
        if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test.")) files.push(path);
      }
    };
    walk(join(packages, "modules"));
    walk(join(packages, "workbench"));
    const owner = readFileSync(join(packages, "api", "src", "dialog.ts"), "utf8");
    expect(owner).toContain('pick.reason === "failed"');
    for (const path of files) {
      expect(readFileSync(path, "utf8"), path).not.toContain('.reason === "failed"');
    }
  });
});

describe("选择器交出路径只写一处", () => {
  it("dialog_pick_accepted_once", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const dialogSrc = readFileSync(join(packages, "api", "src", "dialog.ts"), "utf8");
    const callers = [
      "modules/files/src/FileView.tsx",
      "modules/logs/src/LogAnalyzerView.tsx",
      "modules/mirror/src/store.ts",
      "workbench/src/stores/settings-store.ts",
    ].map((name) => readFileSync(join(packages, name), "utf8"));
    const once = "return " + "pick.ok";
    const fileBan = "if (!" + "pick.ok)";
    const logBan = "if (!" + "picked.ok) return";
    const mirrorBan = "if (!" + "picked.ok)";
    const call = "dialogPick" + "Accepted(";
    expect(dialogSrc.split(once).length - 1).toBe(1);
    expect(callers[0]).not.toContain(fileBan);
    expect(callers[1]).not.toContain(logBan);
    expect(callers[2]).not.toContain(mirrorBan);
    expect(callers[3]).not.toContain(once);
    for (const src of callers) {
      expect(src).toContain(call);
    }
  });
});

describe("选择器失败文案只写一处", () => {
  it("dialog_failure_text_once", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const dialogSrc = readFileSync(join(packages, "api", "src", "dialog.ts"), "utf8");
    const views = [
      "modules/files/src/FileView.tsx",
      "workbench/src/settings/SettingsView.tsx",
      "modules/logs/src/LogAnalyzerView.tsx",
    ].map((name) => readFileSync(join(packages, name), "utf8"));
    const once = "dialogPickFailed(pick) ? " + "DIALOG_FAILED";
    const banned = "toaster.show(" + "DIALOG_FAILED";
    const call = "dialogFailure" + "Text(";
    expect(dialogSrc.split(once).length - 1).toBe(1);
    for (const view of views) {
      expect(view).not.toContain(banned);
      expect(view).toContain(call);
    }
  });
});
