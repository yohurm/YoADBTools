import { describe, expect, it } from "vitest";

import { joinHostPath, LOG_EXPORT_FILE, suggestedExportPath } from "./host-path";

describe("joinHostPath", () => {
  it("空目录只返回文件名", () => {
    expect(joinHostPath("", LOG_EXPORT_FILE)).toBe(LOG_EXPORT_FILE);
  });

  it("Unix 路径用 /", () => {
    expect(joinHostPath("/tmp/exports", LOG_EXPORT_FILE)).toBe(`/tmp/exports/${LOG_EXPORT_FILE}`);
  });

  it("Windows 路径用 \\", () => {
    expect(joinHostPath("D:\\Yohu\\exports", LOG_EXPORT_FILE)).toBe(`D:\\Yohu\\exports\\${LOG_EXPORT_FILE}`);
  });

  it("去掉尾部分隔符再拼", () => {
    expect(joinHostPath("/tmp/exports/", LOG_EXPORT_FILE)).toBe(`/tmp/exports/${LOG_EXPORT_FILE}`);
    expect(joinHostPath("D:\\Yohu\\exports\\", LOG_EXPORT_FILE)).toBe(`D:\\Yohu\\exports\\${LOG_EXPORT_FILE}`);
  });
});

describe("suggestedExportPath", () => {
  it("空目录或未给目录只返回文件名", () => {
    expect(suggestedExportPath()).toBe(LOG_EXPORT_FILE);
    expect(suggestedExportPath("")).toBe(LOG_EXPORT_FILE);
  });

  it("按目录分隔符拼默认导出文件", () => {
    expect(suggestedExportPath("/tmp/exports")).toBe(`/tmp/exports/${LOG_EXPORT_FILE}`);
    expect(suggestedExportPath("D:\\Yohu\\exports")).toBe(`D:\\Yohu\\exports\\${LOG_EXPORT_FILE}`);
  });
});
