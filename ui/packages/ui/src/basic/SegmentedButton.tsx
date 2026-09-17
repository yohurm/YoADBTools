/**
 * YoSegmentedButton —— 分段按钮（L4 视图）。
 * 对齐 HarmonyOS 设计指南三种：页签单选 / 胶囊单选 / 胶囊多选。
 * 类型 / 涂装 / 提交由 segmented-model + segmented-policy 决定；本文件只绑属性与内容区。
 * host 即轨：YoCorner paint 铺在宿主上；单选 YoIndicator 与项同一父级；多选每项自绘选中底。
 *
 * 页签栏仍走 YoTabs；本组件不作一级导航，不承载删除/添加。
 */
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";

import { YoCorner } from "../corner";
import { Icon, isIconName, type IconName } from "../icons";
import { YoIndicator } from "../motion/engines/indicator";
import type { SegmentedGraphic, YoSegmentedButtonSize, YoSegmentedType } from "./segmented-model";
import {
  resolveSegmentedKeyAction,
  resolveSegmentedPointerAction,
  resolveSegmentedRoving,
  resolveSegmentedSelection,
  segmentedHostAttrs,
  segmentedItemAttrs,
  type SegmentedAction,
  type SegmentedActionInput,
} from "./segmented-policy";
import "./SegmentedButton.css";

export type { YoSegmentedButtonSize, YoSegmentedType };

export interface YoSegmentedItem {
  /** 选项值（受控 value / values 对账） */
  value: string;
  /** 文本；可与 icon 组合（鸿蒙 hybrid，图标在上） */
  label?: string;
  /** 可选图标（与 Icon 单源） */
  icon?: IconName;
  /** 选中图标；与 icon 成对才切换（鸿蒙 selectedIcon） */
  selectedIcon?: IconName;
  /** 图片（鸿蒙 Image / 「图片 + 文字」） */
  image?: string;
  /** 选中图片；与 image 成对才切换 */
  selectedImage?: string;
  /** 单项不可用（鸿蒙 enabled=false） */
  disabled?: boolean;
  /** 纯图标时的无障碍名（鸿蒙 accessibilityText） */
  ariaLabel?: string;
  /** 无障碍说明（鸿蒙 accessibilityDescription） */
  ariaDescription?: string;
  /** 未选字色。选中字色走涂装矩阵。 */
  ink?: string;
  /** 选中填。缺省强调色（鸿蒙 selectedBackgroundColor）。 */
  fill?: string;
}

export interface YoSegmentedButtonProps {
  /** 选项集合（鸿蒙 items；大屏建议 ≤7） */
  items: YoSegmentedItem[];
  /** 单选当前值 */
  value?: string;
  /** 多选当前值（item 序；仅 multiple） */
  values?: string[];
  /** 单选变更（值变化才触发） */
  onChange?: (value: string) => void;
  /** 多选变更（含取消到空数组） */
  onChangeValues?: (values: string[]) => void;
  /** 单击项（含再次点击当前项，对齐 onItemClicked） */
  onItemClick?: (index: number) => void;
  /**
   * tab：白选择块（页签切换）。
   * capsule：强调色选择块（表单单选 / 多选筛选）。
   */
  type?: YoSegmentedType;
  /** 胶囊才可多选；tab 强制单选（鸿蒙 multiply）。 */
  multiple?: boolean;
  /** 字号：sm=caption / md=body。高度由密度与是否图文决定。 */
  size?: YoSegmentedButtonSize;
  /** 整组禁用 */
  disabled?: boolean;
  /** 铺满父级。默认 hug。表单行传 block。 */
  block?: boolean;
  /** 无障碍名 */
  ariaLabel?: string;
}

function itemPaintStyle(ink: string | undefined, fill: string | undefined): JSX.CSSProperties | undefined {
  if (!ink && !fill) return undefined;
  const style: JSX.CSSProperties = {};
  if (ink) style["--yohu-segmented-ink"] = ink;
  if (fill) style["--yohu-segmented-item-fill"] = fill;
  return style;
}

function SegmentedGraphicView(props: { graphic: SegmentedGraphic | undefined }): JSX.Element {
  const graphic = props.graphic;
  if (!graphic) return null;
  if (graphic.kind === "icon" && isIconName(graphic.name)) {
    return <Icon name={graphic.name} />;
  }
  if (graphic.kind === "image") {
    return <img class="yohu-segmented__image" src={graphic.src} alt="" />;
  }
  return null;
}

/** 渲染分段按钮。内容区 = 图标/图片 + 标签；单选选择块在轨内，多选画在项上。 */
export function YoSegmentedButton(props: YoSegmentedButtonProps): JSX.Element {
  const itemRefs: Array<HTMLButtonElement | undefined> = [];
  const [focusValue, setFocusValue] = createSignal<string | undefined>();

  const host = createMemo(() =>
    segmentedHostAttrs({
      type: props.type,
      size: props.size,
      multiple: props.multiple,
      block: props.block,
      disabled: props.disabled,
      items: props.items,
    }),
  );

  const multiple = () => host()["data-multiple"] === "";
  const selectedValues = createMemo(() =>
    resolveSegmentedSelection(props.items, multiple(), props.value, props.values),
  );
  const rovingValue = createMemo(() =>
    resolveSegmentedRoving(props.items, selectedValues(), {
      focus: focusValue(),
      value: props.value,
      multiple: multiple(),
    }),
  );

  const actionInput = (): SegmentedActionInput => ({
    items: props.items,
    multiple: multiple(),
    value: props.value,
    values: selectedValues(),
    disabled: props.disabled,
    roving: rovingValue(),
  });

  const applyAction = (action: SegmentedAction): void => {
    setFocusValue(action.focusValue);
    if (action.kind === "roving") {
      queueMicrotask(() => itemRefs[action.index]?.focus());
      return;
    }
    props.onItemClick?.(action.index);
    if (action.kind === "commit-single" && action.changed) props.onChange?.(action.value);
    if (action.kind === "commit-multi" && action.changed) props.onChangeValues?.(action.values);
    if (action.focus) queueMicrotask(() => itemRefs[action.index]?.focus());
  };

  return (
    <div
      class="yohu-segmented"
      data-type={host()["data-type"]}
      data-size={host()["data-size"]}
      data-paint={host()["data-paint"]}
      data-fill-owner={host()["data-fill-owner"]}
      data-hybrid={host()["data-hybrid"]}
      data-multiple={host()["data-multiple"]}
      data-block={host()["data-block"]}
      data-icon-size={host()["data-icon-size"]}
      role={multiple() ? "group" : "radiogroup"}
      aria-label={props.ariaLabel}
      aria-disabled={host()["aria-disabled"]}
      aria-multiselectable={host()["aria-multiselectable"]}
      onKeyDown={(event) => {
        const next = resolveSegmentedKeyAction(actionInput(), event.key);
        if (!next) return;
        event.preventDefault();
        applyAction(next);
      }}
    >
      <YoCorner role="control" stroke={false} mode="paint" />
      <Show when={!multiple()}>
        <YoIndicator follow={props.value} variant="thumb" selector=".yohu-segmented__item[data-selected]" />
      </Show>
      <For each={props.items}>
        {(item, index) => {
          const attrs = () =>
            segmentedItemAttrs(item, selectedValues(), {
              groupDisabled: props.disabled,
              multiple: multiple(),
              roving: rovingValue(),
              items: props.items,
              index: index(),
            });
          return (
            <button
              ref={(el) => {
                itemRefs[index()] = el;
              }}
              type="button"
              class="yohu-segmented__item yohu-focus-ring--inset"
              data-selected={attrs().selected ? "" : undefined}
              data-content={attrs().content}
              data-join={attrs().join}
              style={itemPaintStyle(attrs().ink, attrs().fill)}
              role={multiple() ? undefined : "radio"}
              aria-checked={attrs()["aria-checked"]}
              aria-pressed={attrs()["aria-pressed"]}
              aria-label={attrs().name}
              aria-description={attrs().description}
              disabled={attrs().disabled}
              tabIndex={attrs().tabIndex}
              onClick={() => {
                const next = resolveSegmentedPointerAction(actionInput(), index());
                if (next) applyAction(next);
              }}
            >
              <SegmentedGraphicView graphic={attrs().graphic} />
              {item.label ? <span class="yohu-segmented__label">{item.label}</span> : null}
            </button>
          );
        }}
      </For>
    </div>
  );
}
