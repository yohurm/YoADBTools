import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseRemotePath } from "./path-parse";

describe("parseRemotePath（句法策略）", () => {
  it("POSIX 绝对路径原样，保留 // . ..", () => {
    const r = parseRemotePath("/sdcard//DCIM/./Camera/", "/sdcard");
    expect(r).toMatchObject({ ok: true, path: "/sdcard//DCIM/./Camera/" });
    expect(r.ok && r.applied).not.toContain("collapse");
  });

  it("反斜杠按 Windows 分隔符转 POSIX", () => {
    const r = parseRemotePath("\\sdcard\\DCIM", "/sdcard");
    expect(r).toMatchObject({ ok: true, path: "/sdcard/DCIM", applied: expect.arrayContaining(["separators"]) });
  });

  it("去掉包裹引号", () => {
    const r = parseRemotePath('"/sdcard/My Photos"', "/sdcard");
    expect(r).toMatchObject({ ok: true, path: "/sdcard/My Photos", applied: expect.arrayContaining(["unquote"]) });
  });

  it("file URI 抽路径", () => {
    expect(parseRemotePath("file:///sdcard/DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
      applied: expect.arrayContaining(["file-uri"]),
    });
    expect(parseRemotePath("file://sdcard/DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
    });
  });

  it("别名 ~ / sdcard / /mnt/sdcard", () => {
    expect(parseRemotePath("~", "/storage/emulated/0")).toMatchObject({
      ok: true,
      path: "/sdcard",
      applied: expect.arrayContaining(["alias"]),
    });
    expect(parseRemotePath("sdcard/DCIM", "/storage/emulated/0")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
    });
    expect(parseRemotePath("/mnt/sdcard/DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
    });
  });

  it("相对当前目录；. 与 .. 不折叠", () => {
    expect(parseRemotePath("DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
      applied: expect.arrayContaining(["relative"]),
    });
    expect(parseRemotePath("../Pictures", "/sdcard/DCIM")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM/../Pictures",
    });
    expect(parseRemotePath(".", "/sdcard/DCIM")).toMatchObject({ ok: true, path: "/sdcard/DCIM/." });
  });

  it("本机盘符与 UNC 拒绝", () => {
    expect(parseRemotePath("C:\\\\Users\\\\me", "/sdcard")).toMatchObject({
      ok: false,
      reason: "不是设备路径",
    });
    expect(parseRemotePath("\\\\server\\share", "/sdcard")).toMatchObject({
      ok: false,
      reason: "不是设备路径",
    });
  });

  it("空输入失败", () => {
    expect(parseRemotePath("   ", "/sdcard")).toMatchObject({ ok: false, reason: "路径为空" });
  });

  it("../x 与 /sdcard/../data/x parse 成功且仍含 ..", () => {
    const relative = parseRemotePath("../x", "/sdcard");
    expect(relative.ok).toBe(true);
    if (relative.ok) expect(relative.path).toContain("..");
    const absolute = parseRemotePath("/sdcard/../data/x", "/sdcard");
    expect(absolute).toMatchObject({ ok: true, path: "/sdcard/../data/x" });
    if (absolute.ok) expect(absolute.path).toContain("..");
  });
});

describe("path-parse 不再折叠点段", () => {
  it("源码不含 collapseDotSegments", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "path-parse.ts"), "utf8");
    expect(src).not.toContain("collapseDotSegments");
    expect(src).not.toContain("\"collapse\"");
  });
});
