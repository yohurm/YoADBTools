import { describe, expect, it } from "vitest";

import {
  sessionCaptureLabel,
  sessionCapturePhase,
  sessionEmptyWait,
  sessionIsLive,
  sessionTabDot,
} from "./session-chrome";

describe("sessionCapturePhase", () => {
  it("采集订阅优先于启动中", () => {
    expect(sessionCapturePhase({ capturing: true, starting: true })).toBe("live");
    expect(sessionCapturePhase({ capturing: true, starting: false })).toBe("live");
    expect(sessionCapturePhase({ capturing: false, starting: true })).toBe("starting");
    expect(sessionCapturePhase({ capturing: false, starting: false })).toBe("stopped");
    expect(sessionIsLive({ capturing: true, starting: false })).toBe(true);
    expect(sessionIsLive({ capturing: false, starting: true })).toBe(true);
    expect(sessionIsLive({ capturing: false, starting: false })).toBe(false);
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
    expect(sessionEmptyWait("stopped")).toBeNull();
    expect(sessionEmptyWait("starting")).toEqual({
      title: "正在启动采集…",
      description: "正在连接设备 logcat",
    });
    expect(sessionEmptyWait("live")).toEqual({
      title: "等待设备输出…",
      description: "logcat 采集中，暂未收到行",
    });
  });
});
