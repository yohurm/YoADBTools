import { describe, expect, it } from "vitest";

import {
  PROGRESS_JOIN,
  alreadyExistsText,
  illegalPathText,
  localFailedText,
  localNotFoundText,
  notADirectoryText,
  permissionDeniedText,
  readOnlyText,
  readlinkUnparseableText,
  remoteFailedText,
  remoteNotFoundText,
} from "./file-fault";

describe("文件结果句", () => {
  it("与文件层 Display 同一句", () => {
    expect(illegalPathText("/sdcard/a")).toBe("路径非法: /sdcard/a");
    expect(remoteNotFoundText("/p")).toBe("远端不存在: /p");
    expect(notADirectoryText("/p")).toBe("不是目录: /p");
    expect(permissionDeniedText("/p")).toBe("没有权限: /p");
    expect(readOnlyText("/p")).toBe("文件系统只读: /p");
    expect(alreadyExistsText("/p")).toBe("路径已存在: /p");
    expect(remoteFailedText("/p")).toBe("远端操作失败: /p");
    expect(localNotFoundText("/p")).toBe("本地路径不存在: /p");
    expect(localFailedText("/p")).toBe("本地操作失败: /p");
    expect(readlinkUnparseableText("/p")).toBe("无法识别路径解析结果: /p");
    expect(PROGRESS_JOIN).toBe("传输进度任务已中断");
  });
});
