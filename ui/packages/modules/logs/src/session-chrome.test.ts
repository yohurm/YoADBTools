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
    for (const name of [
      "workspace.ts",
      "capture.ts",
      "capture-orchestrator.ts",
      "capture-subscriptions.ts",
      "device-projection.ts",
      "session-lifecycle.ts",
      "panel-projection.ts",
      "follow-state.ts",
      "LogAnalyzerView.tsx",
    ]) {
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
    const dir = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(resolve(dir, "LogAnalyzerView.tsx"), "utf8");
    const chrome = readFileSync(resolve(dir, "session-chrome.ts"), "utf8");
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
    // 死导出清零：空态等待只由 sessionEmptyView + sessionEmptyIsWait 表达。
    expect(chrome).not.toContain("export function sessionEmptyWait");
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
    expect(sessionEmptyIsWait(sessionEmptyView("live", false))).toBe(true);
    expect(sessionEmptyIsWait(sessionEmptyView("stopped", true))).toBe(false);
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
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    const findById = "sessions.find((s) => " + "s.id === id)";
    const indexById = "findIndex((s) => " + "s.id === id)";
    expect(body.split(findById).length - 1).toBe(0);
    expect(body.split(indexById).length - 1).toBe(1);
  });
});

describe("close session remaining", () => {
  it("close_session_remaining_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    const needle = "x.id !== " + "id";
    expect(body.split(needle).length - 1).toBe(1);
  });
});

describe("工作区会话下标缺失只判一次", () => {
  it("session_missing_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    const needle = "idx " + "< 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionMissing(");
  });
});

describe("按下标取会话只写一次", () => {
  it("session_at_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    const needle = "state.sessions[idx]" + "!";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionAt(");
  });
});

describe("会话不在这台设备只判一次", () => {
  it("session_off_serial_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    const needle = "session.serial !== " + "serial";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("sessionOffSerial(");
  });
});

describe("清空面板只写一次", () => {
  it("clear_panel_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "panel-projection.ts"), "utf8").replaceAll(
      "\r\n",
      "\n",
    );
    const needle = "visible: " + "EMPTY_VIEW_ROWS,\n      signalCount: 0,\n      pendingCount: 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("clearPanel(");
  });
});

describe("抬起跟滚只写一次", () => {
  it("mark_following_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "follow-state.ts"), "utf8");
    const needle = "{ following: true, frozenThroughSeq: null, " + "pendingCount: 0 }";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("markFollowing(");
  });
});

describe("写入进程绑定只写一次", () => {
  it("write_binding_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "device-projection.ts"), "utf8");
    const needle = 'setState("sessions", idx, { ' + "binding })";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("writeBinding(");
  });
});

describe("可见区末序号只写一次", () => {
  it("visible_tail_once", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "follow-state.ts"), "utf8");
    const needle = "lastSeqOf(session.visible, " + "session.fromSeq)";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("visibleTail(");
  });
});

describe("采集相只有一源", () => {
  it("follow-state 不再写 capturing / starting", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const follow = readFileSync(resolve(here, "follow-state.ts"), "utf8");
    // 只允许出现在注释里（说明「这里不写采集相」），不允许任何字段赋值。
    expect(follow).not.toMatch(/capturing\s*:/);
    expect(follow).not.toMatch(/starting\s*:/);

    const orchestrator = readFileSync(resolve(here, "capture-orchestrator.ts"), "utf8");
    // 采集相的三个写点都在编排层，各只有一处 setState 字面量。
    expect(orchestrator).toContain('setState("sessions", idx, { starting: true, capturing: false })');
    expect(orchestrator).toContain('setState("sessions", idx, { capturing: true, starting: false })');
    expect(orchestrator).toContain('setState("sessions", idx, { capturing: false, starting: false })');
    expect(orchestrator.split("starting: true").length - 1).toBe(1);
    expect(orchestrator.split("capturing: true").length - 1).toBe(1);
  });

  it("fromSeq 运行期写点只在 follow-state", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const lifecycle = readFileSync(resolve(here, "session-lifecycle.ts"), "utf8");
    expect(lifecycle).toContain("fromSeq: SESSION_NEVER_STARTED");
    expect(lifecycle.split("fromSeq:").length - 1).toBe(1);

    const projection = readFileSync(resolve(here, "panel-projection.ts"), "utf8");
    expect(projection).not.toContain("fromSeq: 0");
    expect(projection).toContain("resetFollowAfterDeviceClear(");

    const follow = readFileSync(resolve(here, "follow-state.ts"), "utf8");
    expect(follow.split("fromSeq: 0").length - 1).toBe(2);
  });
});
