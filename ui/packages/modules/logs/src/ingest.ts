/**
 * 窗口扇出：设备批次 → 该 serial 上每个订阅窗口的过滤 / 可见区。
 * 不碰采集启停与世代；镜像按设备分桶，窗口只读自己的 serial。
 * 入镜按窗口末行 seq 去重，replay 重叠批次不会把已画出的行再追加一遍。
 */

import type { SetStoreFunction } from "solid-js/store";
import type { LogBatch } from "@yohu/api";

import { matchesLine, toSessionFilter } from "./filter";
import type { MirrorBank } from "./mirror";
import { appendLines, isFreshLine, lastSeqOf, signalCountOf } from "./panel";
import type { LogUiState } from "./workspace";

export type IngestApi = {
  onBatch: (batch: LogBatch) => void;
};

export function createIngest(
  state: LogUiState,
  setState: SetStoreFunction<LogUiState>,
  mirrors: MirrorBank,
): IngestApi {
  const sessionIndex = (id: number): number => state.sessions.findIndex((s) => s.id === id);
  const bufferCapacity = (): number => state.bufferCapacity;

  function onBatch(batch: LogBatch): void {
    mirrors.of(batch.serial).pushBatch(batch);

    state.sessions.forEach((session) => {
      if (session.serial !== batch.serial) return;
      if (!session.capturing || session.fromSeq < 0) return;
      const filter = toSessionFilter(session);
      const after = lastSeqOf(session.visible, session.fromSeq);
      const matched = batch.lines.filter(
        (line) => isFreshLine(line.seq, after, session.fromSeq) && matchesLine(line, filter),
      );
      if (matched.length === 0) return;
      const idx = sessionIndex(session.id);
      if (idx < 0) return;

      if (session.paused) return;
      if (!session.following) {
        setState("sessions", idx, {
          pendingCount: session.pendingCount + matched.length,
        });
        return;
      }
      const visible = appendLines(state.sessions[idx]!.visible, matched, bufferCapacity());
      setState("sessions", idx, {
        visible,
        signalCount: signalCountOf(visible),
      });
    });
  }

  return { onBatch };
}
