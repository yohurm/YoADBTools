import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { newSessionIsPackage, newSessionModeOf, newSessionPackageName, newSessionPid } from "./new-session-mode";

describe("new session mode", () => {
  it("包名划分只比较一次", () => {
    expect(newSessionIsPackage("package")).toBe(true);
    expect(newSessionIsPackage("pid")).toBe(false);
    expect(newSessionModeOf("package")).toBe("package");
    expect(newSessionModeOf("pid")).toBe("pid");
    expect(newSessionModeOf("all")).toBeNull();
    const dialog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    expect(dialog).not.toContain('=== "package"');
    expect(dialog).not.toContain('=== "pid"');
  });

  it("包名和 PID 合格只在划分里判一次", () => {
    expect(newSessionPackageName(" com.foo ")).toBe("com.foo");
    expect(newSessionPackageName(" ")).toBeNull();
    expect(newSessionPid("12")).toBe(12);
    expect(newSessionPid("0")).toBeNull();
    expect(newSessionPid("x")).toBeNull();
    const here = dirname(fileURLToPath(import.meta.url));
    const dialog = readFileSync(join(here, "NewSessionDialog.tsx"), "utf8");
    expect(dialog).not.toContain("Number.parseInt");
    expect(dialog).not.toContain("Number.isInteger");
    expect(dialog).not.toContain("trim().length");
    expect(dialog).not.toContain("pid > 0");
    expect(dialog).not.toContain("pid <= 0");
    const mode = readFileSync(join(here, "new-session-mode.ts"), "utf8")
      .replace("const pid = Number.parseInt(query.trim(), 10);", "")
      .replace("if (!Number.isInteger(pid) || pid <= 0) return null;", "");
    expect(mode).not.toContain("Number.parseInt");
    expect(mode).not.toContain("Number.isInteger");
    expect(mode).not.toContain("pid <= 0");
  });

  it("空白包名不看 name.length === 0", () => {
    const mode = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "new-session-mode.ts"), "utf8");
    expect(mode).not.toContain("name.length === 0");
    expect(mode).toContain("trimmedTextPresent");
  });

  it("检索裁空白后有没有字只走 trimmedTextPresent", () => {
    const dialog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    expect(dialog).not.toContain("if (!q)");
    expect(dialog).not.toContain("if (query().trim())");
    expect(dialog).toContain("trimmedTextPresent");
  });

  it("search_hit_items_once", () => {
    const dialog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    const needle = "match.item ? [match.item]" + " : []";
    expect(dialog.split(needle).length - 1).toBe(1);
  });

  it("filter_prompt_once", () => {
    const dialog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NewSessionDialog.tsx"), "utf8");
    const needle = "过滤或输入" + "包名";
    expect(dialog.split(needle).length - 1).toBe(1);
    expect(dialog).toContain("filterPrompt()");
  });
});
