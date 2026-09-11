/**
 * YoColHeader —— 表头列格。
 * 标题默认靠左并带列内边距（HarmonyOS PC / Finder 列表）。align 只覆盖 center/end。
 * 库包文案槽；有 onSort 时库内渲染 interactive + __label + chevron。
 * 排序字色走宿主 aria-sort（ascending/descending = fg + semibold），禁止页面点内部铬。
 * 列缝铬只走 YoColResizer，本组件不画分割线。
 */
import { createSignal, type JSX } from "solid-js";
import { Show } from "solid-js";

import { Icon } from "../icons";
import { Layout } from "../tokens/layout";
import type { ColResizePhase } from "./col-model";
import { YoColResizer } from "./ColResizer";
import { YoTooltip } from "./Tooltip";
import "./ColHeader.css";

export type YoColHeaderAlign = "start" | "end" | "center";
export type YoColHeaderSort = "ascending" | "descending" | "none";

export interface YoColHeaderProps {
  /** 标题对齐；默认 start。单元格对齐由模块自己管。 */
  align?: YoColHeaderAlign;
  /** 当前列排序态 */
  ariaSort?: YoColHeaderSort;
  /** 有则库内渲染排序钮；模块只传回调，不自绘 button / __label */
  onSort?: () => void;
  /** 排序/标题提示；库内包 YoTooltip */
  tooltip?: string;
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
  /** 标题文案。库包 __label，模块不要再挂该类名 */
  children: JSX.Element;
}

function ColHeaderLabel(props: {
  children: JSX.Element;
  sort: YoColHeaderSort;
  sortable: boolean;
}): JSX.Element {
  return (
    <span class="yohu-col-header__label">
      <span class="yohu-col-header__title">{props.children}</span>
      <Show when={props.sortable && props.sort !== "none"}>
        <span class="yohu-col-header__sort-icon" aria-hidden="true">
          <Icon name={props.sort === "ascending" ? "chevron-up" : "chevron-down"} size={Layout.IconTiny} />
        </span>
      </Show>
    </span>
  );
}

function ColHeaderBody(props: {
  children: JSX.Element;
  sort: YoColHeaderSort;
  onSort?: () => void;
}): JSX.Element {
  const sortable = (): boolean => props.onSort !== undefined;
  return (
    <Show
      when={sortable()}
      fallback={
        <ColHeaderLabel sort={props.sort} sortable={false}>
          {props.children}
        </ColHeaderLabel>
      }
    >
      <button type="button" class="yohu-interactive yohu-focus-ring--inset" onClick={() => props.onSort?.()}>
        <ColHeaderLabel sort={props.sort} sortable>
          {props.children}
        </ColHeaderLabel>
      </button>
    </Show>
  );
}

/**
 * 渲染一列的表头轨道。模块只传标题 / tooltip / onSort，不要点内部铬。
 */
export function YoColHeader(props: YoColHeaderProps): JSX.Element {
  const [resizing, setResizing] = createSignal(false);
  const align = (): YoColHeaderAlign => props.align ?? "start";
  const sort = (): YoColHeaderSort => props.ariaSort ?? "none";

  const onWidthChange = (width: number, phase: ColResizePhase): void => {
    setResizing(phase === "start" || phase === "move");
    props.onWidthChange?.(width, phase);
  };

  return (
    <div
      class="yohu-col-header"
      data-align={align()}
      role="columnheader"
      aria-sort={sort()}
      data-resizing={resizing() ? "" : undefined}
    >
      <div class="yohu-col-header__content">
        <Show
          when={props.tooltip}
          fallback={
            <ColHeaderBody sort={sort()} onSort={props.onSort}>
              {props.children}
            </ColHeaderBody>
          }
        >
          <YoTooltip content={props.tooltip ?? ""} block>
            <ColHeaderBody sort={sort()} onSort={props.onSort}>
              {props.children}
            </ColHeaderBody>
          </YoTooltip>
        </Show>
      </div>
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
