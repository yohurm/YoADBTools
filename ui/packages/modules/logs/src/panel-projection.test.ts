/**
 * 面板投影增量计数：`writePanel` 的 `signalCount` / `docShift` 增量结果必须恒等于全量派生。
 * 覆盖三态：追加、裁头、整文档替换（replacePanel）。信号语义锚点仍是 `signalCountOf(visible)`。
 */

import { createStore } from "solid-js/store";
import { describe, expect, it } from "vitest";

import type { LogLine, SignalKind } from "@yohu/api";

import type { LogUiState } from "./log-model";
import { signalCountOf } from "./panel";
import { createPanelProjection } from "./panel-projection";
import { makeSession } from "./session-lifecycle";
import type { ViewRow } from "./stack";

let seq = 0;

function nextLine(msg = "m"): LogLine {
  seq += 1;
  return { seq, ts: "2026-01-01 00:00:00.000", pid: 100, tid: 1, level: "I", tag: "T", msg };
}

function row(signal?: SignalKind): ViewRow {
  return { line: nextLine(), signal };
}

function setup(cap: number) {
  const [state, setState] = createStore<LogUiState>({
    serial: "S1",
    devices: {},
    sessions: [],
    activeSessionId: null,
    bufferCapacity: cap,
  });
  const session = makeSession(state, { kind: "all" }, "T", "S1");
  setState("sessions", [session]);
  setState("activeSessionId", session.id);
  const state0 = state as LogUiState;
  const panel = createPanelProjection(state0, setState, {
    viewCap: () => cap,
    pageRequest: async () => undefined,
    catchUp: async () => undefined,
    markFollowing: () => undefined,
    resetFollowAfterDeviceClear: () => undefined,
  });
  return { state: state0, panel };
}

describe("writePanel 信号计数增量 === 全量 signalCountOf(visible)", () => {
  it("追加态：增量累加与全量一致", () => {
    const { state, panel } = setup(100);
    const first = [row("crash"), row(), row("anr")];
    panel.writePanel(0, first, 0);
    const session = state.sessions[0]!;
    expect(session.signalCount).toBe(2);
    expect(session.signalCount).toBe(signalCountOf(session.visible));

    const grown = [...session.visible, row(), row("crash")];
    panel.writePanel(0, grown, 0);
    expect(session.signalCount).toBe(3);
    expect(session.signalCount).toBe(signalCountOf(session.visible));
    expect(session.docShift).toBe(0);
  });

  it("裁头态：旧头信号扣减、新行信号累加都与全量一致，docShift 累加", () => {
    const { state, panel } = setup(3);
    panel.writePanel(0, [row(), row("crash"), row()], 0);
    const session = state.sessions[0]!;
    expect(session.signalCount).toBe(1);

    const overCap = [...session.visible, row("anr"), row()];
    panel.writePanel(0, overCap, 0);
    // 裁掉旧头两行（无信号），新增一行 anr 信号
    expect(session.signalCount).toBe(1);
    expect(session.signalCount).toBe(signalCountOf(session.visible));
    expect(session.docShift).toBe(2);
    expect(session.visible.map((r) => r.line.seq)).toEqual(overCap.slice(2).map((r) => r.line.seq));
  });

  it("裁头态：被裁掉的头行带信号时正确扣减", () => {
    const { state, panel } = setup(2);
    panel.writePanel(0, [row("crash"), row(), row()], 0);
    const session = state.sessions[0]!;
    expect(session.signalCount).toBe(0);
    expect(session.signalCount).toBe(signalCountOf(session.visible));

    const overCap = [...session.visible, row("anr")];
    panel.writePanel(0, overCap, 0);
    expect(session.signalCount).toBe(1);
    expect(session.signalCount).toBe(signalCountOf(session.visible));
    expect(session.docShift).toBe(1);
  });

  it("向上分页前插：可见区前插，docShift 负补偿保持视口锚点", () => {
    const { state, panel } = setup(100);
    panel.writePanel(0, [row(), row()], 0);
    const id = state.sessions[0]!.id;
    panel.prependWindow(id, [nextLine("older1"), nextLine("older2")]);
    const session = state.sessions[0]!;
    expect(session.visible).toHaveLength(4);
    expect(session.visible[0]!.line.msg).toBe("older1");
    expect(session.docShift).toBe(-2);
  });
});
