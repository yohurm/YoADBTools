import { describe, expect, it } from "vitest";

import { resolveRemotePath } from "./path-resolve";

describe("resolveRemotePath（解析 + 安全根）", () => {
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
