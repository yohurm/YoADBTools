/**
 * YoSegmentedButton —— 单选分段按钮（L4 视图）。
 * 类型 / 涂装 / 提交由 segmented-model + segmented-policy 决定；本文件只绑属性与内容区。
 * 选择块走 YoIndicator（配方 thumb），禁止自写第二套滑动。
 *
 * 默认 tab：白选择块。capsule 才强调色块。
 * 页签栏仍走 YoTabs；本组件不作一级导航，不承载删除/添加。
 */
import { For, createMemo } from "solid-js";
import type { JSX } from "solid-js";

import { Icon, type IconName } from "../icons";
import { YoIndicator } from "../motion/indicator";
import type { YoSegmentedButtonSize, YoSegmentedType } from "./segmented-model";
import { resolveKeyIndex } from "./segmented-model";
import { resolveSegmentedCommit, segmentedHostAttrs, segmentedItemAttrs } from "./segmented-policy";
import "./SegmentedButton.css";

export type { YoSegmentedButtonSize, YoSegmentedType };

export interface YoSegmentedItem {
  /** 选项值（受控 value 对账） */
  value: string;
  /** 文本；可与 icon 组合（鸿蒙 hybrid） */
  label?: string;
  /** 可选图标（与 Icon 单源） */
  icon?: IconName;
  /** 单项不可用（鸿蒙 enabled=false） */
  disabled?: boolean;
}

export interface YoSegmentedButtonProps {
  /** 选项集合（鸿蒙 items；大屏建议 ≤7） */
  items: YoSegmentedItem[];
  /** 当前值 */
  value: string;
  /** 选中变更（值变化才触发） */
  onChange?: (value: string) => void;
  /** 单击项（含再次点击当前项，对齐 onItemClicked） */
  onItemClick?: (index: number) => void;
  /**
   * tab：白选择块（V2 Tab 默认）。
   * capsule：强调色选择块（V2 Capsule 默认）。
   */
  type?: YoSegmentedType;
  /** 字号：sm=caption / md=body。高度由密度与是否图文决定。 */
  size?: YoSegmentedButtonSize;
  /** 整组禁用 */
  disabled?: boolean;
  /** 无障碍名 */
  ariaLabel?: string;
}

/** 渲染单选分段按钮。内容区 = 图标 + 标签，选择块在铬层。 */
export function YoSegmentedButton(props: YoSegmentedButtonProps): JSX.Element {
  const itemRefs: Array<HTMLButtonElement | undefined> = [];
  const host = createMemo(() =>
    segmentedHostAttrs({
      type: props.type,
      size: props.size,
      disabled: props.disabled,
      items: props.items,
    }),
  );

  const commitIndex = (index: number, focus: boolean): void => {
    const next = resolveSegmentedCommit(props.items, props.value, index, props.disabled);
    if (!next) return;
    props.onItemClick?.(next.index);
    if (next.changed) {
      props.onChange?.(next.value);
    }
    if (focus) {
      queueMicrotask(() => itemRefs[next.index]?.focus());
    }
  };

  const onGroupKeyDown = (event: KeyboardEvent): void => {
    const next = resolveKeyIndex(props.items, props.value, event.key);
    if (next === undefined) return;
    event.preventDefault();
    commitIndex(next, true);
  };

  return (
    <div
      class="yohu-segmented"
      data-type={host()["data-type"]}
      data-size={host()["data-size"]}
      data-paint={host()["data-paint"]}
      data-hybrid={host()["data-hybrid"]}
      data-icon-size={host()["data-icon-size"]}
      role="radiogroup"
      aria-label={props.ariaLabel}
      aria-disabled={host()["aria-disabled"]}
      onKeyDown={onGroupKeyDown}
    >
      <YoIndicator follow={props.value} variant="thumb" selector=".yohu-segmented__item[data-selected]" />
      <For each={props.items}>
        {(item, index) => {
          const attrs = () => segmentedItemAttrs(item, props.value, props.disabled);
          return (
            <button
              ref={(el) => {
                itemRefs[index()] = el;
              }}
              type="button"
              class="yohu-segmented__item yohu-focus-ring--inset"
              data-selected={attrs().selected ? "" : undefined}
              role="radio"
              aria-checked={attrs()["aria-checked"]}
              aria-label={item.label}
              disabled={attrs().disabled}
              tabIndex={attrs().tabIndex}
              onClick={() => commitIndex(index(), false)}
            >
              {item.icon ? <Icon name={item.icon} /> : null}
              {item.label ? <span class="yohu-segmented__label">{item.label}</span> : null}
            </button>
          );
        }}
      </For>
    </div>
  );
}
