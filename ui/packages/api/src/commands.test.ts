import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as commands from "./commands";
import { deviceSetNightMode, deviceStatus, mirrorLayout, mirrorPointer, mirrorPresentSetActive, mirrorScreenshot, mirrorSession, mirrorStart, taskList } from "./commands";

describe("mirror commands", () => {
  it("导出 layout / screenshot / start（无 Channel、无 status）", () => {
    expect(typeof mirrorStart).toBe("function");
    expect(typeof mirrorLayout).toBe("function");
    expect(typeof mirrorPresentSetActive).toBe("function");
    expect(typeof mirrorScreenshot).toBe("function");
    expect(typeof mirrorPointer).toBe("function");
    expect(typeof mirrorSession).toBe("function");
    expect(mirrorSession.length).toBe(0);
    expect(typeof taskList).toBe("function");
    expect(taskList.length).toBe(0);
    expect(mirrorStart.length).toBe(1);
    expect("mirrorStatus" in commands).toBe(false);
    expect("mirrorSync" in commands).toBe(false);
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "commands.ts"), "utf8");
    expect(src).toContain('"mirror.session"');
    expect(src).toContain('"task.list"');
    expect(src).not.toContain("mirror.sync");
  });
});

describe("device status", () => {
  it("导出运行时快照与写深浅色（无 device.nightMode 轮询命令）", () => {
    expect(typeof deviceStatus).toBe("function");
    expect(typeof deviceSetNightMode).toBe("function");
    expect(deviceSetNightMode.length).toBe(2);
    expect("deviceNightMode" in commands).toBe(false);
  });
});

describe("removed dual-source commands", () => {
  it("不导出 settings.get / mirror.status / device.nightMode", () => {
    expect("settingsGet" in commands).toBe(false);
    expect("mirrorStatus" in commands).toBe(false);
    expect("mirrorSync" in commands).toBe(false);
    expect("deviceNightMode" in commands).toBe(false);
  });
});

describe("log snapshots", () => {
  it("导出进程索引与已安装包名", () => {
    expect(typeof commands.logProcessSnapshot).toBe("function");
    expect(typeof commands.logPackageSnapshot).toBe("function");
    expect(commands.logProcessSnapshot.length).toBe(1);
    expect(commands.logPackageSnapshot.length).toBe(1);
  });
});

describe("files session commands", () => {
  it("导出 attach / detach 并锁定点分命令名", () => {
    expect(typeof commands.filesSessionAttach).toBe("function");
    expect(typeof commands.filesSessionDetach).toBe("function");
    expect(typeof commands.filesList).toBe("function");
    expect(commands.filesSessionAttach.length).toBe(1);
    expect(commands.filesSessionDetach.length).toBe(2);
    expect(commands.filesList.length).toBe(3);
    const src = readFileSync(resolve("packages/api/src/commands.ts"), "utf8");
    expect(src).toContain('invoke<BrowseAttach>("files.session.attach", { serial })');
    expect(src).toContain('invoke<void>("files.session.detach", { serial, generation })');
    expect(src).toContain('invoke<RemoteEntry[]>("files.list", { serial, path, generation })');
  });
});
