/**
 * YoDivider —— 分割线（L4）。
 * HarmonyOS 对照：Divider 分割线，默认 1px / hairline，低对比。
 */
import type { JSX } from "solid-js";
import { resolveDividerOrientation, type YoDividerOrientation } from "./divider-model";
import "./Divider.css";

export type { YoDividerOrientation };

export interface YoDividerProps {
  /** 默认 horizontal */
  orientation?: YoDividerOrientation;
}

export function YoDivider(props: YoDividerProps): JSX.Element {
  const orientation = () => resolveDividerOrientation(props.orientation);
  return (
    <hr class="yohu-divider" data-orientation={orientation()} aria-hidden="true" />
  );
}
