import { describe, expect, it } from "vitest";

import { matchBindings, type PanelKeyContext } from "@yohu/ui";

import { LOGS_KEY_BINDINGS } from "./keys";

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
});
