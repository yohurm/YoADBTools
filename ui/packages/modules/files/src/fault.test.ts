import { describe, expect, it } from "vitest";

import { MISSING_DIR, filesFaultText, isCancelledError, isNotFoundError } from "./fault";

describe("filesFaultText", () => {
  it("只把 not_found 收成请重新输入", () => {
    expect(filesFaultText({ code: "not_found", message: "远端不存在: /sdcard/foo" })).toBe(MISSING_DIR);
    expect(filesFaultText({ code: "not_found", message: MISSING_DIR })).toBe(MISSING_DIR);
  });

  it("已分类 Display 原样给出，不扫「不是目录」", () => {
    expect(filesFaultText({ code: "invalid_args", message: "不是目录: /sdcard/a.txt" })).toBe(
      "不是目录: /sdcard/a.txt",
    );
    expect(filesFaultText({ code: "invalid_args", message: "没有权限: /sdcard/x" })).toBe(
      "没有权限: /sdcard/x",
    );
    expect(filesFaultText({ code: "invalid_args", message: "本地路径不存在: C:\\tmp\\a.bin" })).toBe(
      "本地路径不存在: C:\\tmp\\a.bin",
    );
  });

  it("其余 code 信 Display", () => {
    expect(filesFaultText({ code: "cancelled", message: "已取消" })).toBe("已取消");
    expect(filesFaultText({ code: "adb_error", message: "远端操作失败: /sdcard" })).toBe(
      "远端操作失败: /sdcard",
    );
  });
});

describe("isCancelledError", () => {
  it("只认 cancelled code", () => {
    expect(isCancelledError({ code: "cancelled", message: "已取消" })).toBe(true);
    expect(isCancelledError({ code: "adb_error", message: "cancel" })).toBe(false);
    expect(isCancelledError(new Error("取消"))).toBe(false);
  });
});

describe("isNotFoundError", () => {
  it("只认 not_found code", () => {
    expect(isNotFoundError({ code: "not_found", message: "远端不存在: /sdcard/foo" })).toBe(true);
    expect(isNotFoundError({ code: "invalid_args", message: "本地路径不存在: C:\\a.bin" })).toBe(false);
    expect(isNotFoundError({ code: "invalid_args", message: "不是目录: /sdcard/a.txt" })).toBe(false);
    expect(isNotFoundError("not found")).toBe(false);
    expect(isNotFoundError(new Error("路径不存在"))).toBe(false);
  });
});
