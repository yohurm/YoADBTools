import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { CLIPBOARD_WRITE_FAILED, writeClipboard } from "./clipboard";

describe("writeClipboard", () => {
  it("写成功，或任何失败都是复制失败", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await writeClipboard("abc")).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("abc");

    writeText.mockRejectedValue(new DOMException("denied"));
    expect(await writeClipboard("abc")).toEqual({ ok: false, reason: CLIPBOARD_WRITE_FAILED });
    expect(CLIPBOARD_WRITE_FAILED).toBe("复制失败");
    vi.unstubAllGlobals();
  });

  it("文件、日志、命令管理不再自己调剪贴板", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../modules");
    for (const file of ["files/src/FileView.tsx", "logs/src/LogAnalyzerView.tsx", "terminal/src/CommandManager.tsx"]) {
      const text = readFileSync(resolve(root, file), "utf8");
      expect(text).toContain("writeClipboard");
      expect(text).not.toContain("navigator.clipboard");
      expect(text).not.toContain("CLIPBOARD_WRITE_FAILED");
    }
  });
});

describe("剪贴板失败文案只写一处", () => {
  it("clipboard_failure_text_once", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const clipboardSrc = readFileSync(resolve(here, "clipboard.ts"), "utf8");
    const root = resolve(here, "../../modules");
    const views = [
      "files/src/FileView.tsx",
      "logs/src/LogAnalyzerView.tsx",
      "terminal/src/CommandManager.tsx",
    ].map((name) => readFileSync(resolve(root, name), "utf8"));
    const once = "return result.ok ? undefined : " + "result.reason";
    const banned = "if (!" + "result.ok)";
    const call = "clipboardFailure" + "Text(";
    expect(clipboardSrc.split(once).length - 1).toBe(1);
    for (const view of views) {
      expect(view).not.toContain(banned);
      expect(view).toContain(call);
    }
  });
});
