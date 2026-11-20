import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyCaptureEvent, captureDecisionIsIgnore, captureDecisionIsStopped } from "./capture-event";

describe("applyCaptureEvent", () => {
  it("旧世代丢弃", () => {
    expect(applyCaptureEvent(2, 1, false)).toEqual({ kind: "ignore" });
    expect(applyCaptureEvent(2, 1, true)).toEqual({ kind: "ignore" });
  });

  it("同世代 adopt 不必减水位", () => {
    expect(applyCaptureEvent(3, 3, true)).toEqual({ kind: "running", generation: 3 });
    expect(applyCaptureEvent(3, 3, false)).toEqual({ kind: "stopped", generation: 3 });
  });

  it("新世代只升不减", () => {
    expect(applyCaptureEvent(1, 4, true)).toEqual({ kind: "running", generation: 4 });
    expect(applyCaptureEvent(1, 4, false)).toEqual({ kind: "stopped", generation: 4 });
  });

  it("忽略和停止只在对账里比较", () => {
    expect(captureDecisionIsIgnore({ kind: "ignore" })).toBe(true);
    expect(captureDecisionIsIgnore({ kind: "running", generation: 1 })).toBe(false);
    expect(captureDecisionIsStopped({ kind: "stopped", generation: 2 })).toBe(true);
    expect(captureDecisionIsStopped({ kind: "running", generation: 2 })).toBe(false);
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of ["capture-event.ts", "capture.ts", "capture-orchestrator.ts"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "capture-event.ts") {
        body = body.replace('return decision.kind === "ignore"', "").replace('return decision.kind === "stopped"', "");
      }
      expect(body, name).not.toContain('kind === "ignore"');
      expect(body, name).not.toContain('kind === "stopped"');
    }
  });

  it("命令目标设备只回落一次", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture-orchestrator.ts"), "utf8").replace(
      "return explicit ?? session?.serial ?? state.serial;",
      "",
    );
    expect(body).not.toContain("?.serial ?? state.serial");
  });

  it("View 不再自算回落链，改调 store 的 commandSerialOf", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(join(here, "LogAnalyzerView.tsx"), "utf8");
    expect(view).toContain("logStore.commandSerialOf(");
    expect(view).not.toContain("active()?.serial ?? boundSerial");
    const capture = readFileSync(join(here, "capture.ts"), "utf8");
    expect(capture).toContain("commandSerialOf: orchestrator.commandSerialOf");
  });

  it("窗口占设备只走 sessionHoldsSerial", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    let body = readFileSync(join(here, "hold.ts"), "utf8") + readFileSync(join(here, "capture-orchestrator.ts"), "utf8");
    body = body.replace("session.serial === serial && sessionHolds(session)", "");
    expect(body).not.toContain("session.serial === serial && sessionHolds(session)");
    expect(body).not.toContain("session.serial !== device || !sessionHolds(session)");
  });

  it("窗口占着流且序列号有值只走 sessionHoldsBound", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    let body = readFileSync(join(here, "hold.ts"), "utf8") + readFileSync(join(here, "capture-orchestrator.ts"), "utf8");
    body = body.replace("Boolean(session.serial) && sessionHolds(session)", "");
    expect(body).not.toContain("Boolean(session.serial) && sessionHolds(session)");
    expect(body).not.toContain("sessionHolds(s) && s.serial");
    expect(body).not.toContain("session?.serial && sessionHolds(session)");
  });

  it("改标题空白不看 trimmed.length === 0", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "session-lifecycle.ts"), "utf8");
    expect(body).not.toContain("trimmed.length === 0");
    expect(body).toContain("trimmedTextPresent");
  });

  it("界面可见性监听只归 View，IPC/store 不碰 DOM", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const capture = readFileSync(join(here, "capture.ts"), "utf8");
    const orchestrator = readFileSync(join(here, "capture-orchestrator.ts"), "utf8");
    expect(capture).not.toContain("addEventListener");
    expect(capture).not.toContain("documentIsHidden");
    expect(orchestrator).not.toContain("addEventListener");
    const view = readFileSync(join(here, "LogAnalyzerView.tsx"), "utf8");
    expect(view).toContain("documentIsHidden");
    expect(view).toContain('addEventListener("visibilitychange"');
    expect(view).toContain('addEventListener("focus"');
  });
});

describe("采集状态失败只记一次", () => {
  it("log_capture_status_failed_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture-orchestrator.ts"), "utf8");
    const needle = 'console.error("log.capture.status ' + '失败", e)';
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("logCaptureStatusFailed(");
  });
});

describe("采集停止只记一次", () => {
  it("log_capture_stopped_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture-orchestrator.ts"), "utf8");
    const needle = "采集" + "停止";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("logCaptureStopped(");
  });
});

describe("当前页只向窗口索引要一次", () => {
  it("load_page_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "viewport-page.ts"), "utf8");
    expect(body.split("async function loadPage").length - 1).toBe(1);
    expect(body).toContain("logWindowBind(");
    expect(body).not.toContain("mirrors.of(");
  });
});

describe("采集相写点收敛到编排层", () => {
  it("starting 只有 markStarting 一处写，且同时清 capturing", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture-orchestrator.ts"), "utf8");
    const needle = 'setState("sessions", idx, { starting: true, capturing: false })';
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("markStarting(");
    expect(body).toContain("markLive(");
    expect(body).toContain("markStopped(");
  });
});

describe("设备仍被窗口占着只判一次", () => {
  it("device_still_held_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture-orchestrator.ts"), "utf8");
    const needle = "holdCount(state.sessions, device) " + "> 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("deviceStillHeld(");
  });
});

describe("会话查找只在 session-lifecycle，编排层不重写", () => {
  it("session_lookup_reused", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const orchestrator = readFileSync(join(here, "capture-orchestrator.ts"), "utf8");
    expect(orchestrator).toContain("sessionMissing(");
    expect(orchestrator).toContain("sessionAt(");
    expect(orchestrator).toContain("sessionById(");
    expect(orchestrator).not.toContain("idx " + "< 0");
    expect(orchestrator).not.toContain("state.sessions[idx]" + "!");
    const lifecycle = readFileSync(join(here, "session-lifecycle.ts"), "utf8");
    expect(lifecycle).toContain("export function sessionMissing");
    expect(lifecycle).toContain("export function sessionAt");
  });
});
