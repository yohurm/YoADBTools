import { describe, expect, it } from "vitest";

import { effectivePath } from "./path-display";

describe("effectivePath", () => {
  it("已配置值优先于解析回退", () => {
    expect(effectivePath("C:\\tools\\adb.exe", "C:\\auto\\adb.exe")).toBe("C:\\tools\\adb.exe");
  });

  it("空值与空白回退到绝对路径", () => {
    expect(effectivePath("", "C:\\Users\\me\\YohuAdbTools\\data")).toBe(
      "C:\\Users\\me\\YohuAdbTools\\data",
    );
    expect(effectivePath("   ", "D:\\data")).toBe("D:\\data");
  });
});
