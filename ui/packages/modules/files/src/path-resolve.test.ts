import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PathGuardError } from "./path-guard";
import { resolveRemotePath } from "./path-resolve";

describe("resolveRemotePath（解析 + 安全根）", () => {
  const testdata = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../../core/yohu-domain/testdata/safety_root.json",
  );
  const fixture: {
    path: string;
    ok?: boolean;
    normalized?: string;
    error?: PathGuardError;
  }[] = JSON.parse(readFileSync(testdata, "utf8")) as {
    path: string;
    ok?: boolean;
    normalized?: string;
    error?: PathGuardError;
  }[];

  it.each(fixture.filter((c) => c.path.startsWith("/")))("$path 经 resolve 与 fixture 同 error", (c) => {
    const result = resolveRemotePath(c.path, "/sdcard");
    if (c.ok) {
      expect(result.ok).toBe(true);
      if (result.ok && c.normalized) expect(result.path).toBe(c.normalized);
      return;
    }
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(c.error);
  });

  it("../Pictures 相对当前目录为 traversal", () => {
    expect(resolveRemotePath("../Pictures", "/sdcard/DCIM")).toMatchObject({
      ok: false,
      error: "traversal",
    });
  });

  it("相对名不会被误加成 /DCIM", () => {
    expect(resolveRemotePath("DCIM", "/sdcard")).toMatchObject({ ok: true, path: "/sdcard/DCIM" });
  });

  it("/storage/emulated/0 在安全根内", () => {
    expect(resolveRemotePath("/storage/emulated/0/DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/storage/emulated/0/DCIM",
    });
  });
});
