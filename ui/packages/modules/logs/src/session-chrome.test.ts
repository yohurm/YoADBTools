import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  sessionCaptureButton,
  sessionCaptureButtonTone,
  sessionCaptureLabel,
  sessionCaptureOccupies,
  sessionCaptureIsLive,
  sessionCapturePhase,
  sessionEmptyView,
  sessionEmptyIsWait,
  sessionEmptyWait,
  sessionPhaseIsLive,
  sessionStatusTone,
  sessionTabDot,
} from "./session-chrome";

describe("sessionCapturePhase", () => {
  it("采集订阅优先于启动中", () => {
    expect(sessionCapturePhase({ capturing: true, starting: true })).toBe("live");
    expect(sessionCapturePhase({ capturing: true, starting: false })).toBe("live");
    expect(sessionCapturePhase({ capturing: false, starting: true })).toBe("starting");
    expect(sessionCapturePhase({ capturing: false, starting: false })).toBe("stopped");
    expect(sessionCaptureIsLive({ capturing: true, starting: true })).toBe(true);
    expect(sessionCaptureIsLive({ capturing: false, starting: true })).toBe(false);
    const dir = dirname(fileURLToPath(import.meta.url));
    for (const name of ["workspace.ts", "capture.ts", "LogAnalyzerView.tsx"]) {
      const body = readFileSync(resolve(dir, name), "utf8");
      expect(body, name).not.toContain("session.capturing");
      expect(body, name).not.toContain("!.capturing");
      expect(body, name).not.toContain("?.capturing");
    }
  });
});

describe("session chrome", () => {
  it("Tab 圆点、状态行、空态只认采集相，不看信号", () => {
    expect(sessionTabDot("live")).toEqual({ tone: "success" });
    expect(sessionTabDot("starting")).toEqual({ tone: "accent" });
    expect(sessionTabDot("stopped")).toBeUndefined();
    expect(sessionCaptureLabel("live")).toBe("采集中");
    expect(sessionCaptureLabel("starting")).toBe("启动中");
    expect(sessionCaptureLabel("stopped")).toBe("已停止");
    expect(sessionCaptureButton("starting")).toBe("取消启动");
    expect(sessionCaptureButton("live")).toBe("停止");
    expect(sessionCaptureButton("stopped")).toBe("开始");
    expect(sessionCaptureButtonTone("stopped")).toBe("accent");
    expect(sessionCaptureButtonTone("starting")).toBe("danger");
    expect(sessionCaptureButtonTone("live")).toBe("danger");
    expect(sessionCaptureOccupies("starting")).toBe(true);
    expect(sessionCaptureOccupies("live")).toBe(true);
    expect(sessionCaptureOccupies("stopped")).toBe(false);
    const view = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "LogAnalyzerView.tsx"), "utf8");
    expect(view).toContain("sessionCaptureButton");
    expect(view).toContain("sessionEmptyView");
    expect(view).toContain("sessionStatusTone");
    expect(view).not.toContain("取消启动");
    expect(view).not.toContain("未采集");
    expect(view).not.toContain("无匹配日志");
    expect(view).not.toContain("windowLive");
    expect(view).not.toContain('=== "live"');
    expect(view).not.toContain('=== "stopped"');
    expect(view).not.toContain('=== "starting"');
    expect(sessionEmptyWait("stopped")).toBeNull();
    expect(sessionEmptyWait("starting")).toEqual({
      title: "正在启动采集…",
      description: "正在连接设备 logcat",
    });
    expect(sessionEmptyWait("live")).toEqual({
      title: "等待设备输出…",
      description: "logcat 采集中，暂未收到行",
    });
    expect(sessionEmptyView("stopped", false)).toMatchObject({ kind: "idle", title: "未采集", action: "开始采集" });
    expect(sessionEmptyView("stopped", true).kind).toBe("filtered");
    expect(sessionEmptyView("live", true).kind).toBe("filtered");
    expect(sessionEmptyView("starting", true).kind).toBe("wait");
    expect(sessionEmptyView("live", false).kind).toBe("wait");
    expect(sessionStatusTone("live")).toBe("success");
    expect(sessionStatusTone("starting")).toBe("offline");
    expect(sessionStatusTone("stopped")).toBe("offline");
    expect(sessionPhaseIsLive("live")).toBe(true);
    expect(sessionPhaseIsLive("starting")).toBe(false);
    const chrome = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-chrome.ts"), "utf8");
    const liveBody = chrome.replace('return phase === "live"', "");
    expect(liveBody).not.toContain('=== "live"');
    expect(chrome).not.toContain('=== "stopped"');
    expect(chrome).toContain('phase !== "stopped"');
    expect(view).toContain("sessionEmptyIsWait");
    expect(view).not.toContain('kind === "wait"');
    expect(view).not.toContain('kind === "idle"');
    expect(view).toContain("empty().action");
    expect(sessionEmptyView("stopped", true).action).toBeUndefined();
    expect(sessionEmptyView("live", false).action).toBeUndefined();
    expect(sessionEmptyIsWait(sessionEmptyView("starting", false))).toBe(true);
    expect(sessionEmptyIsWait(sessionEmptyView("stopped", false))).toBe(false);
    const waitBody = chrome.replace('return view.kind === "wait"', "");
    expect(waitBody).not.toContain('kind === "wait"');
    expect(chrome).toContain("YoButtonTone");
    expect(chrome).toContain("YoTabDotTone");
    expect(chrome).toContain("YoStatusDotTone");
    expect(chrome).not.toContain('"danger" | "accent"');
    expect(chrome).not.toContain('"success" | "accent"');
    expect(chrome).not.toContain('"success" | "offline"');
  });
});

describe("session index", () => {
  it("session_index_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const findById = "sessions.find((s) => " + "s.id === id)";
    const indexById = "findIndex((s) => " + "s.id === id)";
    expect(body.split(findById).length - 1).toBe(0);
    expect(body.split(indexById).length - 1).toBe(1);
  });
});

describe("close session remaining", () => {
  it("close_session_remaining_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "x.id !== " + "id";
    expect(body.split(needle).length - 1).toBe(1);
  });
});

describe("工作区会话下标缺失只判一次", () => {
  it("workspace_session_missing_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "idx " + "< 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionMissing(");
  });
});

describe("工作区按下标取会话只写一次", () => {
  it("workspace_session_at_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "state.sessions[idx]" + "!";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionAt(");
  });
});

describe("会话不在这台设备只判一次", () => {
  it("session_off_serial_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "session.serial !== " + "serial";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionOffSerial(");
  });
});

describe("清空面板只写一次", () => {
  it("clear_panel_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "writePanel(idx, " + "EMPTY_VIEW_ROWS, 0)";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("clearPanel(");
  });
});

describe("抬起跟滚只写一次", () => {
  it("mark_following_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "{ following: true, frozenThroughSeq: null, " + "pendingCount: 0 }";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("markFollowing(");
  });
});

describe("写入进程绑定只写一次", () => {
  it("write_binding_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = 'setState("sessions", idx, { ' + "binding })";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("writeBinding(");
  });
});

describe("可见区末序号只写一次", () => {
  it("visible_tail_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    const needle = "lastSeqOf(session.visible, " + "session.fromSeq)";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("visibleTail(");
  });
});
