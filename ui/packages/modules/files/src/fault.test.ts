import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  localNotFoundText,
  notADirectoryText,
  permissionDeniedText,
  remoteFailedText,
  remoteNotFoundText,
} from "@yohu/api";

import { MISSING_DIR, faultLine, filesFaultText, isNotFoundError, joinFaultLines } from "./fault";

describe("filesFaultText", () => {
  it("只把 not_found 收成请重新输入", () => {
    expect(filesFaultText({ code: "not_found", message: remoteNotFoundText("/sdcard/foo") })).toBe(MISSING_DIR);
    expect(filesFaultText({ code: "not_found", message: MISSING_DIR })).toBe(MISSING_DIR);
  });

  it("已分类 Display 原样给出，不扫「不是目录」", () => {
    const notDir = notADirectoryText("/sdcard/a.txt");
    const denied = permissionDeniedText("/sdcard/x");
    const missing = localNotFoundText("C:\\tmp\\a.bin");
    expect(filesFaultText({ code: "invalid_args", message: notDir })).toBe(notDir);
    expect(filesFaultText({ code: "invalid_args", message: denied })).toBe(denied);
    expect(filesFaultText({ code: "invalid_args", message: missing })).toBe(missing);
  });

  it("不是 IPC 错误时不嗅原文", () => {
    expect(() => filesFaultText(new Error("浏览器原文"))).toThrow(TypeError);
  });

  it("其余 code 信 Display", () => {
    expect(filesFaultText({ code: "cancelled", message: "已取消" })).toBe("已取消");
    expect(filesFaultText({ code: "adb_error", message: remoteFailedText("/sdcard") })).toBe(
      remoteFailedText("/sdcard"),
    );
  });
});

describe("失败拼句", () => {
  it("一条是名字加原因，多条用分号，空名单是空串", () => {
    expect(faultLine("a.txt", "设备忙")).toBe("a.txt: 设备忙");
    expect(joinFaultLines([])).toBe("");
    expect(joinFaultLines(["a.txt: 设备忙", "b.txt: 忙"])).toBe("a.txt: 设备忙；b.txt: 忙");
  });

  it("删除和上传不再各写句式", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of readdirSync(dir)) {
      if (!/\.tsx?$/.test(name) || name.includes(".test.")) continue;
      const text = readFileSync(join(dir, name), "utf8");
      expect(text, name).not.toContain('failures.join("；")');
      expect(text, name).not.toContain("`${name}: ${filesFaultText");
      expect(text, name).not.toContain("`${name}: ${child.reason}");
      expect(text, name).not.toContain("`${name || local}:");
    }
  });
});

describe("捕获失败只拼一次", () => {
  it("caught_fault_line_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const files = ["fault.ts", "listing.ts", "transfers.ts"] as const;
    const banned = ["faultLine(name, ", "filesFaultText(e))"].join("");
    const kept = ["faultLine(label, ", "filesFaultText(e))"].join("");
    let keptHits = 0;
    for (const name of files) {
      const text = readFileSync(join(dir, name), "utf8");
      expect(text.split(banned).length - 1, name).toBe(0);
      const hits = text.split(kept).length - 1;
      expect(hits, name).toBe(name === "fault.ts" ? 1 : 0);
      keptHits += hits;
    }
    expect(keptHits).toBe(1);
  });
});

describe("捕获异常写成清单错误", () => {
  it("notify_caught_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const faultCall = ["filesFault", "Text(e)"].join("");
    const notifyDirect = ["notifyError(", "filesFaultText"].join("");
    const caught = ["notify", "Caught("].join("");
    const listing = readFileSync(join(dir, "listing.ts"), "utf8");
    const transfers = readFileSync(join(dir, "transfers.ts"), "utf8");
    expect(listing.split(faultCall).length - 1).toBe(2);
    expect(transfers.split(faultCall).length - 1).toBe(0);
    expect(listing.split(notifyDirect).length - 1).toBe(0);
    expect(listing).toContain(caught);
    expect(transfers).toContain(caught);
  });
});

describe("isNotFoundError", () => {
  it("只认 not_found code", () => {
    expect(isNotFoundError({ code: "not_found", message: remoteNotFoundText("/sdcard/foo") })).toBe(true);
    expect(isNotFoundError({ code: "invalid_args", message: localNotFoundText("C:\\a.bin") })).toBe(false);
    expect(isNotFoundError({ code: "invalid_args", message: notADirectoryText("/sdcard/a.txt") })).toBe(false);
    expect(isNotFoundError("not found")).toBe(false);
    expect(isNotFoundError(new Error("路径不存在"))).toBe(false);
  });
});
