import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { matchBindings, type PanelKeyContext } from "@yohu/ui";

import {
  LOGS_KEY_BINDINGS,
  logsKeyIsClear,
  logsKeyIsCloseTab,
  logsKeyIsCopy,
  logsKeyIsFind,
  logsKeyIsNewTab,
  logsKeyIsNextTab,
  logsKeyIsPause,
  logsKeyIsSelectAll,
} from "./keys";

function keyEvent(init: Pick<KeyboardEventInit, "key" | "ctrlKey">): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("LOGS_KEY_BINDINGS", () => {
  const ctx = (over: Partial<PanelKeyContext> = {}): PanelKeyContext => ({
    inPanel: true,
    inList: false,
    inEditable: false,
    inDialog: false,
    inShell: false,
    inActionable: false,
    ...over,
  });
  const list = ctx({ inList: true });
  const field = ctx({ inEditable: true });
  const chrome = ctx();
  const button = ctx({ inActionable: true });
  const rail = ctx({ inShell: true });

  it("本页默认操作日志：铬上 Ctrl+A/C/Space；过滤框 Ctrl+F 且放行 Ctrl+A；Space 不抢按钮/侧栏", () => {
    expect(matchBindings(keyEvent({ key: " " }), list, LOGS_KEY_BINDINGS)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), chrome, LOGS_KEY_BINDINGS)).toBe("pause");
    expect(matchBindings(keyEvent({ key: " " }), button, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: " " }), rail, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("select-all");
    expect(matchBindings(keyEvent({ key: "c", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("copy");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), field, LOGS_KEY_BINDINGS)).toBeNull();
    expect(matchBindings(keyEvent({ key: "f", ctrlKey: true }), field, LOGS_KEY_BINDINGS)).toBe("find");
    expect(matchBindings(keyEvent({ key: "l", ctrlKey: true }), chrome, LOGS_KEY_BINDINGS)).toBe("clear");
    expect(matchBindings(keyEvent({ key: "a", ctrlKey: true }), rail, LOGS_KEY_BINDINGS)).toBe("select-all");
  });

  it("每种动作只判一次", () => {
    expect(logsKeyIsPause("pause")).toBe(true);
    expect(logsKeyIsClear("clear")).toBe(true);
    expect(logsKeyIsFind("find")).toBe(true);
    expect(logsKeyIsNewTab("new-tab")).toBe(true);
    expect(logsKeyIsCloseTab("close-tab")).toBe(true);
    expect(logsKeyIsNextTab("next-tab")).toBe(true);
    expect(logsKeyIsSelectAll("select-all")).toBe(true);
    expect(logsKeyIsCopy("copy")).toBe(true);
    expect(logsKeyIsPause("copy")).toBe(false);
    expect(logsKeyIsCopy("pause")).toBe(false);
  });
});

describe("日志快捷键只在 keys 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const actions = ["pause", "clear", "find", "new-tab", "close-tab", "next-tab", "select-all", "copy"];

  it("视图不再比较 action 字面量", () => {
    for (const name of ["keys.ts", "LogAnalyzerView.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      for (const action of actions) {
        body = body.replaceAll(`return action === "${action}"`, "");
        expect(body, name).not.toContain(`action === "${action}"`);
      }
    }
  });

  it("open_new_session_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "setNewOpen(" + "true)";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("openNewSession(");
  });

  it("clear_active_visible_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "logStore." + "clearVisible";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("clearActiveVisible(");
  });

  it("window_has_serial_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const present = "windowSerial() " + "!== null";
    const absent = "windowSerial() " + "=== null";
    const helper = "windowHas" + "Serial(";
    expect(view.split(present).length - 1).toBe(1);
    expect(view.split(absent).length - 1).toBe(0);
    expect(view).toContain(helper);
  });

  it("show_error_text_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "toaster.show(errorText(e), " + '"error")';
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("showErrorText(");
  });

  it("export_needs_capture_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "toaster.show(EXPORT_NEEDS_CAPTURE, " + '"info")';
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("showExportNeedsCapture(");
  });

  it("session_by_id_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "sessions." + "find(";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("sessionById(");
  });
});

describe("keyed 回调按 id 再读收成 live", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("session_id_reread_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "sessionById(" + "session.id)";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view.split("live()").length - 1).toBe(6);
    expect(view).toContain("session={session}");
    expect(view).toContain("visible ?? EMPTY_ROWS");
  });
});

describe("keyed 回调采集阶段只判一次", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("session_capture_phase_once", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "sessionCapturePhase(" + "session)";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("sessionStatusTone(sessionPhase)");
    expect(view).toContain("sessionCaptureLabel(sessionPhase)");
    expect(view).toContain("sessionCapturePhase(props.session)");
    expect(view).toContain("sessionCapturePhase(s)");
  });
});

describe("formatOpts 窗口序列号只走 windowSerial", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("format_opts_serial_is_window_serial", () => {
    const view = readFileSync(join(root, "LogAnalyzerView.tsx"), "utf8");
    const needle = "active()?.serial " + "?? windowSerial()";
    expect(view.split(needle).length - 1).toBe(0);
    expect(view).toContain("const serial = windowSerial()");
    expect(view).toContain("active()?.serial ?? boundSerial(props.selectedSerials)");
    expect(view).toContain("deviceSlice(logStore.state, active()?.serial)");
  });
});

describe("缓冲滞后文案只写一次", () => {
  it("overflow_lag_badge_once", () => {
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "LogAnalyzerView.tsx"), "utf8");
    const needle = "缓冲滞后（已" + "回补）";
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("overflowLagBadge(");
  });
});

describe("失败提示只写一次", () => {
  it("show_failure_once", () => {
    const view = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "LogAnalyzerView.tsx"), "utf8");
    const needle = "toaster.show(failure, " + '"error")';
    expect(view.split(needle).length - 1).toBe(1);
    expect(view).toContain("showFailure(");
  });
});
