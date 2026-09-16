/**
 * YoStatusDot —— 圆点状态标（L4）。
 * HarmonyOS 对照：Badge 圆点标记，列表左 8×8vp。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { statusDotHostAttrs } from "./status-dot-policy";
import type { YoStatusDotTone } from "./status-dot-model";
import "./StatusDot.css";

export type { YoStatusDotTone };

export interface YoStatusDotProps {
  /** 语义色。默认 offline */
  tone?: YoStatusDotTone;
  /** 有文案才暴露给辅助技术；默认装饰 hidden */
  label?: string;
}

export function YoStatusDot(props: YoStatusDotProps): JSX.Element {
  const host = createMemo(() => statusDotHostAttrs(props));
  return (
    <span
      class="yohu-status-dot"
      data-tone={host()["data-tone"]}
      role={host().role}
      aria-hidden={host()["aria-hidden"]}
      aria-label={host()["aria-label"]}
    />
  );
}
