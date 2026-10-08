import { describe, expect, it } from "vitest";

import { LOG_EXPORT_FILE, suggestedExportPath } from "./host-path";

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
