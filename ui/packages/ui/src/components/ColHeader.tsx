/**
 * YoColHeader —— 表头列格。
 * 标题默认靠左并带列内边距（HarmonyOS PC / Finder 列表）。align 只覆盖 center/end。
 * 排序钮铺满内容区且 padding 0；文案边距只写在 .yohu-col-header__label。
 * 列缝铬只走 YoColResizer，本组件不画分割线。
 */
import { createSignal, type JSX } from "solid-js";
import { Show } from "solid-js";

import { YoColResizer } from "./ColResizer";
import type { ColResizePhase } from "./col-resize";
import "./ColHeader.css";

export type YoColHeaderAlign = "start" | "end" | "center";
export type YoColHeaderSort = "ascending" | "descending" | "none";

export interface YoColHeaderProps {
  /** 标题对齐；默认 start。单元格对齐由模块自己管。 */
  align?: YoColHeaderAlign;
  /** 当前列排序态 */
  ariaSort?: YoColHeaderSort;
  /** 是否显示右缘拖拽条 */
  resizable?: boolean;
  /** 拖拽条无障碍名称 */
  resizeLabel?: string;
  /** 当前列宽（px）；与 Resizer 受控 */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number, phase: ColResizePhase) => void;
  onFit?: () => void;
  children: JSX.Element;
}

/**
 * 渲染一列的表头轨道。模块只往内容区塞排序文案，不要在模块 CSS 再画列分割线。
 */
export function YoColHeader(props: YoColHeaderProps): JSX.Element {
  const [resizing, setResizing] = createSignal(false);
  const align = (): YoColHeaderAlign => props.align ?? "start";

  const onWidthChange = (width: number, phase: ColResizePhase): void => {
    setResizing(phase === "start" || phase === "move");
    props.onWidthChange?.(width, phase);
  };

  return (
    <div
      class="yohu-col-header"
      classList={{
        "yohu-col-header--start": align() === "start",
        "yohu-col-header--end": align() === "end",
        "yohu-col-header--center": align() === "center",
      }}
      role="columnheader"
      aria-sort={props.ariaSort ?? "none"}
      data-resizing={resizing() ? "" : undefined}
    >
      <div class="yohu-col-header__content">{props.children}</div>
      <Show when={props.resizable && props.onWidthChange !== undefined && props.width !== undefined}>
        <YoColResizer
          width={props.width ?? 0}
          minWidth={props.minWidth ?? 0}
          maxWidth={props.maxWidth}
          label={props.resizeLabel}
          onWidthChange={onWidthChange}
          onFit={props.onFit}
        />
      </Show>
    </div>
  );
}
