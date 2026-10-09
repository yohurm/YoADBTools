import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { hostOsIsLinux, hostOsIsMacos, hostOsIsWindows } from "./host-os";

describe("宿主系统", () => {
  it("windows 与 macos 各判一次", () => {
    expect(hostOsIsWindows("windows")).toBe(true);
    expect(hostOsIsMacos("macos")).toBe(true);
    expect(hostOsIsWindows("macos")).toBe(false);
    expect(hostOsIsMacos("windows")).toBe(false);
    expect(hostOsIsWindows("")).toBe(false);
    expect(hostOsIsMacos("linux")).toBe(false);
    expect(hostOsIsLinux("linux")).toBe(true);
    expect(hostOsIsLinux("windows")).toBe(false);
    expect(hostOsIsWindows("linux")).toBe(false);
  });
});

describe("宿主系统只在 host-os 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("仓库和视图不再比较 os 字面量", () => {
    const files = [
      "host-os.ts",
      "settings-store.ts",
      join("..", "shell", "AppLayout.tsx"),
      join("..", "settings", "UpdateDialogs.tsx"),
    ];
    for (const name of files) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return os === "windows"', "");
      body = body.replaceAll('return os === "macos"', "");
      expect(body, name).not.toContain('os() === "windows"');
      expect(body, name).not.toContain('os() === "macos"');
      expect(body, name).not.toContain('=== "windows"');
      expect(body, name).not.toContain('=== "macos"');
    }
  });
});
