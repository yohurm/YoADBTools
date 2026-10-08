import { describe, expect, it } from "vitest";

import { hostBaseName, joinHostPath } from "./host-path";

describe("hostBaseName", () => {
  it("Windows 文件与目录尾斜杠", () => {
    expect(hostBaseName("C:\\Users\\a\\photo.png")).toBe("photo.png");
    expect(hostBaseName("C:\\Users\\a\\DCIM\\")).toBe("DCIM");
  });

  it("POSIX 与无目录名", () => {
    expect(hostBaseName("/tmp/foo.txt")).toBe("foo.txt");
    expect(hostBaseName("readme.md")).toBe("readme.md");
  });
});

describe("joinHostPath", () => {
  it("空目录只返回文件名", () => {
    expect(joinHostPath("", "logcat-export.txt")).toBe("logcat-export.txt");
  });

  it("按目录里出现的分隔符拼接，并去掉尾部分隔符", () => {
    expect(joinHostPath("/tmp/exports", "logcat-export.txt")).toBe("/tmp/exports/logcat-export.txt");
    expect(joinHostPath("/tmp/exports/", "logcat-export.txt")).toBe("/tmp/exports/logcat-export.txt");
    expect(joinHostPath("D:\\Yohu\\exports", "logcat-export.txt")).toBe(
      "D:\\Yohu\\exports\\logcat-export.txt",
    );
    expect(joinHostPath("D:\\Yohu\\exports\\", "logcat-export.txt")).toBe(
      "D:\\Yohu\\exports\\logcat-export.txt",
    );
  });
});
