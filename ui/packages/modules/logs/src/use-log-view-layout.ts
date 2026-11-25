/**
 * 清单视口的 UI 瞬态测量：chPx / rowChars。
 * 只做 DOM 测量与 ResizeObserver，不承载业务状态；View 渲染消费这两把量。
 * 表头横滑偏移属会话级状态，归 View 的会话列宽存储（不再在这里持信号）。
 */

import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

import type { DeviceSession } from "@yohu/api";
import { logLineWraps } from "@yohu/api";

import { DEFAULT_CH_PX } from "./editor";
import { measureChPx, measureRowContentWidth } from "./layout";

export type LogViewLayout = {
  chPx: Accessor<number>;
  rowChars: Accessor<number>;
};

export function useLogViewLayout(opts: {
  listEl: Accessor<HTMLDivElement | null>;
  settings: Accessor<DeviceSession["settings"]>;
}): LogViewLayout {
  const [chPx, setChPx] = createSignal(DEFAULT_CH_PX);
  const [rowChars, setRowChars] = createSignal(0);

  createEffect(() => {
    opts.settings().density;
    const host = opts.listEl();
    if (host) {
      setChPx(measureChPx(host));
    }
  });

  createEffect(() => {
    if (!logLineWraps(opts.settings().log_line_layout)) {
      setRowChars(0);
      return;
    }
    const host = opts.listEl();
    const px = chPx();
    if (!host) {
      return;
    }
    const apply = (): void => {
      setRowChars(px > 0 ? Math.floor(measureRowContentWidth(host) / px) : 0);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    onCleanup(() => ro.disconnect());
  });

  return { chPx, rowChars };
}
