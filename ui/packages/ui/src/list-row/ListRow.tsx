/**
 * YoListRow —— 清单行盒（L4）。
 * 只画格子：hairline 与底。document 可选单选半径走 L2 chip，跟 fill 滑块同一 token。
 * 投放框是 list-frame 叠加层，不进本组件。
 * 禁止挂 yohu-interactive / yohu-focus-ring。虚拟化几何由调用方 inline。
 */
import type { JSX } from "solid-js";

import { listRowHostAttrs } from "./list-row-policy";
import type { YoListRowTone } from "./list-row-model";
import "./ListRow.css";

export type { YoListRowTone };

export interface YoListRowProps {
  tone?: YoListRowTone;
  selected?: boolean;
  hot?: boolean;
  selectable?: boolean;
  /** 多选 key 集；只给 L2 判 chip / 直角，行盒不读集合成员。 */
  selectedKeys?: ReadonlySet<string | number>;
  /** 显式 chip：每项 ripple 走 `--yohu-ripple-radius`，不因 hairline 或多选改直角。 */
  radius?: "chip";
  dataKey?: string | number;
  dataReorder?: "source";
  /** 源行占位。placeholder 时调用方不挂文本。 */
  dataSlot?: "placeholder";
  role?: "option";
  ariaSelected?: boolean;
  tabIndex?: number;
  class?: string;
  style?: JSX.CSSProperties;
  children?: JSX.Element;
  onPointerDown?: JSX.EventHandlerUnion<HTMLDivElement, PointerEvent>;
  onClick?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
  onContextMenu?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>;
  onKeyDown?: JSX.EventHandlerUnion<HTMLDivElement, KeyboardEvent>;
}

export function YoListRow(props: YoListRowProps): JSX.Element {
  const host = () =>
    listRowHostAttrs({
      tone: props.tone,
      selected: props.selected,
      hot: props.hot,
      selectable: props.selectable,
      selectedKeys: props.selectedKeys,
      radius: props.radius,
    });

  return (
    <div
      class={`yohu-list-row${props.class ? ` ${props.class}` : ""}`}
      data-tone={host()["data-tone"]}
      data-fill={host()["data-fill"]}
      data-selectable={host()["data-selectable"]}
      data-radius={host()["data-radius"]}
      data-key={props.dataKey}
      data-reorder={props.dataReorder}
      data-slot={props.dataSlot}
      role={props.role}
      aria-selected={props.ariaSelected}
      tabIndex={props.tabIndex}
      style={props.style}
      onPointerDown={props.onPointerDown}
      onClick={props.onClick}
      onContextMenu={props.onContextMenu}
      onKeyDown={props.onKeyDown}
    >
      {props.children}
    </div>
  );
}
