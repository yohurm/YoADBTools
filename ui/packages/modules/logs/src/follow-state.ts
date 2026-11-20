/**
 * 跟滚 / 冻结 / 文档游标唯一状态机：`following` / `frozenThroughSeq` / `fromSeq` 的转移只在此处。
 * 采集相（`capturing` / `starting`）**不在这里写**：唯一写方是 `capture-orchestrator`。
 * `pendingCount` 归零也在此（`markFollowing`）；增量只在 `panel-projection.writePanel`。
 * `signalCount` 由可见派生（`signalCountOf(visible)`），本文件不碰。
 * 空面板不能冻结：没有已画行就没有底部。
 */

import type { SetStoreFunction } from "solid-js/store";

import { canFreezeFollow, lastSeqOf, nextDiscardFromSeq } from "./panel";
import { sessionHolds } from "./hold";
import type { LogSessionState, LogUiState } from "./log-model";
import { sessionAt, sessionIndex, sessionMissing } from "./session-lifecycle";

export type FollowStateDeps = {
  /** panel-projection.clearPanel：清空可见区与计数字段。 */
  clearPanel: (idx: number) => void;
  /** panel-projection.catchUpSession：跟滚抬起后向环要尾页。 */
  catchUpSession: (id: number) => Promise<void>;
};

export type FollowStateApi = {
  markFollowing: (idx: number) => void;
  /**
   * 订阅已建立：续采保留 `fromSeq` 与可见区，首次订阅把游标重置为环起点 0。
   * 只写 `fromSeq` / `following` / `frozenThroughSeq`；采集相由 capture-orchestrator 收口。
   */
  attachWindow: (id: number, device: string, resumeWindow: boolean) => void;
  /** 清设备缓冲后恢复跟滚：只改 following / frozenThroughSeq。 */
  resumeFollowing: (idx: number) => void;
  setFollowing: (id: number, following: boolean) => Promise<void>;
  /** 订阅撤销：只尝试冻结可见区；采集相由 capture-orchestrator 收口。 */
  unsubscribeSession: (id: number) => void;
  discardView: (id: number) => void;
  /** 清设备缓冲后的游标转移：`fromSeq=0` + 抬起跟滚 + pending 归零（面板已由 panel 清空）。 */
  resetAfterDeviceClear: (idx: number) => void;
};

function visibleTail(session: LogSessionState): number {
  return lastSeqOf(session.visible, session.fromSeq);
}

export function createFollowState(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  deps: FollowStateDeps,
): FollowStateApi {
  function markFollowing(idx: number): void {
    setState("sessions", idx, { following: true, frozenThroughSeq: null, pendingCount: 0 });
  }

  function attachWindow(id: number, device: string, resumeWindow: boolean): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    if (sessionAt(state, idx).serial !== device) return;
    if (resumeWindow) {
      setState("sessions", idx, { following: true, frozenThroughSeq: null });
      return;
    }
    setState("sessions", idx, { fromSeq: 0, following: true, frozenThroughSeq: null });
  }

  function resumeFollowing(idx: number): void {
    setState("sessions", idx, { following: true, frozenThroughSeq: null });
  }

  function unsubscribeSession(id: number): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(state, idx);
    if (!sessionHolds(session)) return;
    if (!canFreezeFollow(session.visible)) return;
    setState("sessions", idx, {
      following: false,
      frozenThroughSeq: visibleTail(session),
    });
  }

  function setFollowing(id: number, following: boolean): Promise<void> {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return Promise.resolve();
    const session = sessionAt(state, idx);
    if (session.following === following) return Promise.resolve();
    if (following) {
      markFollowing(idx);
      return deps.catchUpSession(id);
    }
    if (!canFreezeFollow(session.visible)) return Promise.resolve();
    setState("sessions", idx, {
      following: false,
      frozenThroughSeq: visibleTail(session),
    });
    return Promise.resolve();
  }

  function discardView(id: number): void {
    const idx = sessionIndex(state, id);
    if (sessionMissing(idx)) return;
    const session = sessionAt(state, idx);
    const fromSeq = nextDiscardFromSeq(session.fromSeq, session.visible.at(-1)?.line.seq, session.lastSeenSeq);
    setState("sessions", idx, {
      fromSeq,
      following: true,
      frozenThroughSeq: null,
    });
    deps.clearPanel(idx);
  }

  function resetAfterDeviceClear(idx: number): void {
    setState("sessions", idx, {
      fromSeq: 0,
      following: true,
      frozenThroughSeq: null,
      pendingCount: 0,
    });
  }

  return {
    markFollowing,
    attachWindow,
    resumeFollowing,
    setFollowing,
    unsubscribeSession,
    discardView,
    resetAfterDeviceClear,
  };
}
