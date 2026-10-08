import { describe, expect, it } from "vitest";

import { IMPORT_MANAGER_OPEN, importBlockedByManager } from "./import-guard";

describe("importBlockedByManager", () => {
  it("管理窗口开着才拒绝，句只有一句", () => {
    expect(importBlockedByManager(false)).toBeNull();
    expect(importBlockedByManager(true)).toBe(IMPORT_MANAGER_OPEN);
    expect(IMPORT_MANAGER_OPEN).toBe("请先关闭命令管理");
  });
});
