import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeIpcError, deviceOfflineText, errorText, ipcErrorCode, isCancelledError, saveFailedText, EXEC_TIMEOUT, CAPTURE_TRUNCATED, PUMP_PANIC, TOOL_UNAVAILABLE, SHELL_NO_STDIN, SHELL_NO_STDOUT, SHELL_HANDSHAKE, SHELL_ENDED, SHELL_EXEC } from "./error";
import type { IpcError } from "./types";

const notFound: IpcError = { code: "not_found", message: "没有这个目录" };

describe("decodeIpcError", () => {
  it("一次解码 {code,message}", () => {
    expect(decodeIpcError(notFound)).toEqual(notFound);
    expect(errorText(notFound)).toBe("没有这个目录");
    expect(ipcErrorCode(notFound)).toBe("not_found");
  });

  it("不是 IpcError 对象则失败", () => {
    expect(() => decodeIpcError(JSON.stringify(notFound))).toThrow(TypeError);
    expect(() => decodeIpcError("plain")).toThrow(TypeError);
    expect(() => decodeIpcError({ message: "only" })).toThrow(TypeError);
    expect(() => errorText("plain")).toThrow(TypeError);
    expect(ipcErrorCode("plain")).toBeUndefined();
    expect(ipcErrorCode({ message: "only" })).toBeUndefined();
  });

  it("掉线句与领域 Display 相同", () => {
    expect(deviceOfflineText("S1")).toBe("设备掉线: S1");
  });

  it("运输句与宿主、领域常量相同", () => {
    expect(EXEC_TIMEOUT).toBe("执行超时");
    expect(CAPTURE_TRUNCATED).toBe("输出超过捕获预算");
    expect(PUMP_PANIC).toBe("输出泵任务异常结束");
    expect(TOOL_UNAVAILABLE).toBe("ADB 不可用");
    expect(SHELL_NO_STDIN).toBe("浏览 shell 无 stdin");
    expect(SHELL_NO_STDOUT).toBe("浏览 shell 无 stdout");
    expect(SHELL_HANDSHAKE).toBe("浏览 shell 握手失败");
    expect(SHELL_ENDED).toBe("浏览 shell 已结束");
    expect(SHELL_EXEC).toBe("浏览 shell exec 失败");
  });

  it("保存失败把动作加在错误句前面", () => {
    expect(saveFailedText("必须是字符串")).toBe("保存失败: 必须是字符串");
  });

  it("只认 cancelled code", () => {
    expect(isCancelledError({ code: "cancelled", message: "已取消" })).toBe(true);
    expect(isCancelledError({ code: "adb_error", message: "cancel" })).toBe(false);
    expect(isCancelledError(new Error("取消"))).toBe(false);
  });
});

describe("取消码只写一处", () => {
  it("模块和生产源不各自比较 cancelled", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === "node_modules") continue;
          walk(path);
          continue;
        }
        if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test.")) files.push(path);
      }
    };
    walk(join(packages, "modules"));
    walk(join(packages, "workbench"));
    const owner = join(packages, "api", "src", "error.ts");
    const ownerText = readFileSync(owner, "utf8");
    expect(ownerText).toContain('ipcErrorCode(e) === "cancelled"');
    const ownerBody = ownerText.replace('ipcErrorCode(e) === "cancelled"', "");
    expect(ownerBody).not.toContain('=== "cancelled"');
    for (const path of files) {
      expect(readFileSync(path, "utf8"), path).not.toContain('ipcErrorCode(e) === "cancelled"');
    }
  });
});
