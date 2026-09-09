/**
 * 列宽拖拽会话（L2）。每帧从起点重算绝对宽度，禁止累加 dx。
 * 对照：AG Grid HorizontalResizeService；TanStack startOffset / startSize。
 */

import { clampColWidth, type YoColSpec } from "./col-model";

export interface ColResizeSession {
  key: string;
  startX: number;
  startWidth: number;
}

export type ColResizePhase = "start" | "move" | "end";

export function beginColResize(key: string, startX: number, startWidth: number): ColResizeSession {
  return { key, startX, startWidth };
}

export function moveColResize(session: ColResizeSession, clientX: number, spec: YoColSpec): number {
  const next = Number.isFinite(clientX) ? session.startWidth + clientX - session.startX : session.startWidth;
  return clampColWidth(spec, next);
}
