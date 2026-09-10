import { describe, expect, it } from "vitest";

import { parseRemotePath } from "./path-parse";
import { resolveRemotePath } from "./path-resolve";

describe("parseRemotePath（句法策略）", () => {
  it("POSIX 绝对路径原样（折叠多余斜杠）", () => {
    const r = parseRemotePath("/sdcard//DCIM/./Camera/", "/sdcard");
    expect(r).toMatchObject({ ok: true, path: "/sdcard/DCIM/Camera" });
    expect(r.ok && r.applied).toContain("collapse");
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

  it("相对当前目录；. 与 .. 折叠", () => {
    expect(parseRemotePath("DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/sdcard/DCIM",
      applied: expect.arrayContaining(["relative"]),
    });
    expect(parseRemotePath("../Pictures", "/sdcard/DCIM")).toMatchObject({
      ok: true,
      path: "/sdcard/Pictures",
    });
    expect(parseRemotePath(".", "/sdcard/DCIM")).toMatchObject({ ok: true, path: "/sdcard/DCIM" });
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

  it("空输入与穿越根", () => {
    expect(parseRemotePath("   ", "/sdcard")).toMatchObject({ ok: false, reason: "路径为空" });
    expect(parseRemotePath("/sdcard/../../etc", "/sdcard")).toMatchObject({
      ok: false,
      reason: "路径穿越安全根",
    });
  });
});

describe("resolveRemotePath（解析 + 安全根）", () => {
  it("相对名不会被误加成 /DCIM", () => {
    expect(resolveRemotePath("DCIM", "/sdcard")).toMatchObject({ ok: true, path: "/sdcard/DCIM" });
  });

  it("安全根外拒绝", () => {
    expect(resolveRemotePath("/data/local/tmp", "/sdcard")).toMatchObject({
      ok: false,
      reason: "路径不在安全根内",
    });
  });

  it("/storage/emulated/0 在安全根内", () => {
    expect(resolveRemotePath("/storage/emulated/0/DCIM", "/sdcard")).toMatchObject({
      ok: true,
      path: "/storage/emulated/0/DCIM",
    });
  });
});
