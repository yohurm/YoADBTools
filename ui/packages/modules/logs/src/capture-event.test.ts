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
    for (const name of ["capture-event.ts", "capture.ts"]) {
      let body = readFileSync(join(here, name), "utf8");
      if (name === "capture-event.ts") {
        body = body.replace('return decision.kind === "ignore"', "").replace('return decision.kind === "stopped"', "");
      }
      expect(body, name).not.toContain('kind === "ignore"');
      expect(body, name).not.toContain('kind === "stopped"');
    }
  });

  it("命令目标设备只回落一次", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8").replace(
      "return explicit ?? session?.serial ?? state.serial;",
      "",
    );
    expect(body).not.toContain("?.serial ?? state.serial");
  });

  it("窗口占设备只走 sessionHoldsSerial", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    let body = readFileSync(join(here, "hold.ts"), "utf8") + readFileSync(join(here, "capture.ts"), "utf8");
    body = body.replace("session.serial === serial && sessionHolds(session)", "");
    expect(body).not.toContain("session.serial === serial && sessionHolds(session)");
    expect(body).not.toContain("session.serial !== device || !sessionHolds(session)");
  });

  it("窗口占着流且序列号有值只走 sessionHoldsBound", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    let body = readFileSync(join(here, "hold.ts"), "utf8") + readFileSync(join(here, "capture.ts"), "utf8");
    body = body.replace("Boolean(session.serial) && sessionHolds(session)", "");
    expect(body).not.toContain("Boolean(session.serial) && sessionHolds(session)");
    expect(body).not.toContain("sessionHolds(s) && s.serial");
    expect(body).not.toContain("session?.serial && sessionHolds(session)");
  });

  it("改标题空白不看 trimmed.length === 0", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "workspace.ts"), "utf8");
    expect(body).not.toContain("trimmed.length === 0");
    expect(body).toContain("trimmedTextPresent");
  });

  it("界面恢复监听只登记一次", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    expect(body.split("add" + "EventListener").length - 1).toBe(1);
    expect(body.split("remove" + "EventListener").length - 1).toBe(1);
    expect(body).toContain('listen(document, "visibilitychange", onUiResume)');
    expect(body).toContain('listen(window, "focus", onUiResume)');
  });
});

describe("采集状态失败只记一次", () => {
  it("log_capture_status_failed_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const needle = 'console.error("log.capture.status ' + '失败", e)';
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("logCaptureStatusFailed(");
  });
});

describe("采集停止只记一次", () => {
  it("log_capture_stopped_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const needle = "采集" + "停止";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("logCaptureStopped(");
  });
});

describe("从游标回放只写一次", () => {
  it("replay_from_cursor_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const replay = "logReplay({ serial: device, from_seq: from, limit: " + "bufferCapacity() })";
    const cursor = "mirrors.of(device)." + "nextSeq()";
    expect(body.split(replay).length - 1).toBe(1);
    expect(body.split(cursor).length - 1).toBe(1);
    expect(body).toContain("replayFromCursor(");
  });
});

describe("清掉启动中只写一次", () => {
  it("clear_starting_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const needle = 'setState("sessions", done, { ' + "starting: false })";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("clearStarting(");
  });
});

describe("设备仍被窗口占着只判一次", () => {
  it("device_still_held_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const needle = "holdCount(state.sessions, device) " + "> 0";
    expect(body.split(needle).length - 1).toBe(1);
    expect(body).toContain("deviceStillHeld(");
  });
});

describe("会话号相等只判一次", () => {
  it("session_id_is_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const same = "session.id === " + "id";
    const findId = "s.id === " + "id";
    const findSession = "s.id === " + "sessionId";
    expect(body.split(same).length - 1).toBe(1);
    expect(body.split(findId).length - 1).toBe(0);
    expect(body.split(findSession).length - 1).toBe(0);
    expect(body).toContain("sessionIdIs(");
    expect(body).toContain("sessionById(");
  });
});

describe("会话下标缺失只判一次", () => {
  it("session_missing_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const missing = "idx " + "< 0";
    const present = "done " + ">= 0";
    expect(body.split(missing).length - 1).toBe(1);
    expect(body.split(present).length - 1).toBe(0);
    expect(body).toContain("sessionMissing(");
  });
});

describe("按下标取会话只写一次", () => {
  it("session_at_once", () => {
    const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "capture.ts"), "utf8");
    const at = "state.sessions[idx]" + "!";
    const done = "state.sessions[done]" + "!";
    expect(body.split(at).length - 1).toBe(1);
    expect(body.split(done).length - 1).toBe(0);
    expect(body).toContain("sessionAt(");
  });
});
