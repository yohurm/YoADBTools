/**
 * 页拉取与代际：`log.window.bind` 换过滤/回补取整页（唯一取页通路）。
 * 只做「向环要页 + 代际作废旧页」，不碰设备投影与跟滚状态。
 */

import type { LogPage } from "@yohu/api";
import { logWindowBind } from "@yohu/api";

import { sessionWire, toSessionFilter } from "./filter";
import type { LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionById } from "./session-lifecycle";

export type ViewportPageApi = {
  bumpPage: (id: number) => number;
  loadPage: (id: number) => Promise<void>;
};

export type ViewportPageDeps = {
  applyPage: (id: number, page: LogPage) => void;
};

export function createViewportPage(state: LogUiState, deps: ViewportPageDeps): ViewportPageApi {
  const pageGen = new Map<number, number>();

  function bumpPage(id: number): number {
    const next = (pageGen.get(id) ?? 0) + 1;
    pageGen.set(id, next);
    return next;
  }

  async function loadPage(id: number): Promise<void> {
    const session = sessionById(state, id);
    if (!session?.serial || !sessionCaptureIsLive(session)) return;
    const gen = bumpPage(id);
    const page = await logWindowBind({
      id: session.id,
      serial: session.serial,
      // `pidSet` 在 toSessionFilter 里算一次，wire 侧复用同一份。
      filter: sessionWire(toSessionFilter(session)),
      from_seq: Math.max(0, session.fromSeq),
    });
    if (pageGen.get(id) !== gen) return;
    deps.applyPage(id, page);
  }

  return { bumpPage, loadPage };
}
