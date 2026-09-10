import { describe, expect, it } from "vitest";

import { MISSING_DIR, classifyRemoteStderr, filesFaultText } from "./fault";

describe("classifyRemoteStderr", () => {
  it("识别 ls 不存在", () => {
    expect(
      classifyRemoteStderr("ls: /sdcard/Android/data/com.ggec/: No such file or directory"),
    ).toBe(MISSING_DIR);
  });

  it("识别其余设备侧异常", () => {
    expect(classifyRemoteStderr("ls: /sdcard/a.txt: Not a directory")).toBe(MISSING_DIR);
    expect(classifyRemoteStderr("rm: Permission denied")).toBe("没有权限访问该路径");
    expect(classifyRemoteStderr("mkdir: Read-only file system")).toBe("文件系统只读");
    expect(classifyRemoteStderr("touch: File exists")).toBe("路径已存在");
    expect(classifyRemoteStderr("toybox: unknown")).toBeNull();
  });
});

describe("filesFaultText", () => {
  it("把退出码 + ls stderr 收成请重新输入，不原样展示", () => {
    const raw = "执行失败(退出码 1): ls: /sdcard/Android/data/com.ggec/: No such file or directory";
    expect(filesFaultText(raw)).toBe(MISSING_DIR);
    expect(filesFaultText(raw)).not.toContain("退出码");
  });

  it("core 已分类的不存在文案统一成请重新输入", () => {
    expect(filesFaultText({ code: "not_found", message: "路径不存在: /sdcard/foo" })).toBe(MISSING_DIR);
    expect(filesFaultText({ code: "not_found", message: MISSING_DIR })).toBe(MISSING_DIR);
  });
});
