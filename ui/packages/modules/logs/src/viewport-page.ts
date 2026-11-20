/**
 * 环形缓冲拉取（LogCat 对齐，ADR-v6-049）：窗口文档一律从设备环按 seq 游标拉取，
 * 过滤在 UI 消费端。`loadPage`（重绑：换过滤/初始/恢复）重置游标后把环里已有行拉齐；
 * `pullThrough` 增量拉到给定水位。推送只是信号，丢信号由下一次水位或兜底 tick 补齐。
 */

import type { LogLine } from "@yohu/api";
import { logRange } from "@yohu/api";

import type { LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionById } from "./session-lifecycle";

const PULL_BATCH = 5000;

export type ViewportPageApi = {
  /** 重绑（换过滤 / 首次开始）：重置游标并拉齐环里已有的行（可越过暂停）。 */
  loadPage: (id: number) => Promise<void>;
  /** 增量追赶：从当前游标拉到给定水位（不重置、不越过暂停）。 */
  pullThrough: (id: number, throughSeq: number) => Promise<void>;
  /** 追尾：把该窗口从游标拉到环尾（恢复跟滚 / 回前台）。 */
  catchUp: (id: number) => Promise<void>;
};

export type ViewportPageDeps = {
  resetRingCursor: (id: number) => void;
  appendRingLines: (id: number, lines: readonly LogLine[], force?: boolean) => void;
};

export function createViewportPage(state: LogUiState, deps: ViewportPageDeps): ViewportPageApi {
  async function pull(id: number, throughSeq: number, force: boolean): Promise<void> {
    for (let round = 0; round < 200; round += 1) {
      const session = sessionById(state, id);
      if (!session?.serial || !sessionCaptureIsLive(session)) return;
      if (session.paused && !force) return;
      const cursor =
        session.lastSeenSeq >= session.fromSeq
          ? session.lastSeenSeq + 1
          : Math.max(0, session.fromSeq);
      if (cursor > throughSeq) return;
      let batch: LogLine[];
      try {
        const raw = logRange({ serial: session.serial, from_seq: cursor, limit: PULL_BATCH }) as
          | LogLine[]
          | Promise<LogLine[]>;
        batch = Array.isArray(raw) ? raw : await raw;
      } catch (e) {
        console.error("log.range 拉取失败", e);
        return;
      }
      if (batch.length === 0) return;
      deps.appendRingLines(id, batch, force);
      const last = batch[batch.length - 1]!.seq;
      if (last < cursor) return;
      if (batch.length < PULL_BATCH || last >= throughSeq) return;
    }
  }

  async function loadPage(id: number): Promise<void> {
    const session = sessionById(state, id);
    if (!session?.serial || !sessionCaptureIsLive(session)) return;
    deps.resetRingCursor(id);
    await pull(id, Number.MAX_SAFE_INTEGER, true);
  }

  async function pullThrough(id: number, throughSeq: number): Promise<void> {
    await pull(id, throughSeq, false);
  }

  async function catchUp(id: number): Promise<void> {
    await pull(id, Number.MAX_SAFE_INTEGER, false);
  }

  return { loadPage, pullThrough, catchUp };
}
