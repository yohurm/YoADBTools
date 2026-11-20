/**
 * 页拉取：`log.window.bind` 换过滤/回补取整页（唯一取页通路）。
 *
 * 只做「向环要页 + 作废过期页响应」，不碰设备投影与跟滚状态。
 * 页响应按请求序号去重（后发起的请求胜出）；命中事件是增量，**不得**参与页代际
 * （见 `panel-projection.applyPage` 的按 seq 对账）。窗口文档的游标由 `panel-projection`
 * 与 `follow-state` 维护，本层不持文档状态。
 */

import type { LogPage } from "@yohu/api";
import { logWindowBind } from "@yohu/api";

import { sessionWire, toSessionFilter } from "./filter";
import type { LogUiState } from "./log-model";
import { sessionCaptureIsLive } from "./session-chrome";
import { sessionById } from "./session-lifecycle";

export type ViewportPageApi = {
  loadPage: (id: number) => Promise<void>;
};

export type ViewportPageDeps = {
  applyPage: (id: number, page: LogPage) => void;
};

export function createViewportPage(state: LogUiState, deps: ViewportPageDeps): ViewportPageApi {
  const requestSeq = new Map<number, number>();

  async function loadPage(id: number): Promise<void> {
    const session = sessionById(state, id);
    if (!session?.serial || !sessionCaptureIsLive(session)) return;
    const seq = (requestSeq.get(id) ?? 0) + 1;
    requestSeq.set(id, seq);
    const page = await logWindowBind({
      id: session.id,
      serial: session.serial,
      // `pidSet` 在 toSessionFilter 里算一次，wire 侧复用同一份。
      filter: sessionWire(toSessionFilter(session)),
      from_seq: Math.max(0, session.fromSeq),
    });
    if (requestSeq.get(id) !== seq) return;
    deps.applyPage(id, page);
  }

  return { loadPage };
}
