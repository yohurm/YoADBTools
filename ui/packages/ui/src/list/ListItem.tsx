/**
 * YoListItem —— 效率型列表行（L4）。
 * HarmonyOS 对照：ListItem。选中走 .yohu-interactive；模块不再自挂 button 皮。
 */
import { Show, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { listItemHostAttrs } from "./list-item-policy";
import type { YoListItemRing, YoListItemRole, YoListItemSize } from "./list-item-model";
import "./ListItem.css";

export type { YoListItemRing, YoListItemRole, YoListItemSize };

export interface YoListItemProps {
  /** option=listbox 行；button=导航页。默认 option */
  role?: YoListItemRole;
  /** nav=导航行高；device=设备卡行高 */
  size?: YoListItemSize;
  /** 焦点环。导航 inset，设备 outset */
  ring?: YoListItemRing;
  selected?: boolean;
  /** 仅 button：aria-current=page */
  current?: boolean;
  tabIndex?: number;
  /** 无障碍名（图标轨等） */
  label?: string;
  leading?: JSX.Element;
  title: string;
  description?: string;
  meta?: string;
  trailing?: JSX.Element;
  class?: string;
  onClick?: (event: MouseEvent) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}

export function YoListItem(props: YoListItemProps): JSX.Element {
  const host = createMemo(() =>
    listItemHostAttrs({
      role: props.role,
      size: props.size,
      ring: props.ring,
      selected: props.selected,
      current: props.current,
      hasLeading: props.leading != null,
      hasDescription: Boolean(props.description),
      hasMeta: Boolean(props.meta),
      hasTrailing: props.trailing != null,
    }),
  );

  const className = (): string => {
    const ring = host()["data-ring"] === "inset" ? "yohu-focus-ring--inset" : "yohu-focus-ring";
    const extra = props.class ? ` ${props.class}` : "";
    return `yohu-list-item yohu-interactive ${ring}${extra}`;
  };

  const body = (): JSX.Element => (
    <>
      <Show when={props.leading}>
        {(leading) => <span class="yohu-list-item__leading">{leading()}</span>}
      </Show>
      <span class="yohu-list-item__info">
        <span class="yohu-list-item__title">{props.title}</span>
        <Show when={props.description || props.meta}>
          <span class="yohu-list-item__extra">
            <span class="yohu-list-item__extra-inner">
              <span class="yohu-list-item__extra-content">
                <Show when={props.description}>
                  {(description) => <span class="yohu-list-item__description">{description()}</span>}
                </Show>
                <Show when={props.meta}>
                  {(meta) => <span class="yohu-list-item__meta">{meta()}</span>}
                </Show>
              </span>
            </span>
          </span>
        </Show>
      </span>
      <Show when={props.trailing}>
        {(trailing) => (
          <span class="yohu-list-item__end">
            <span class="yohu-list-item__end-inner">
              <span class="yohu-list-item__trailing">{trailing()}</span>
            </span>
          </span>
        )}
      </Show>
    </>
  );

  return (
    <Show
      when={host().role === "button"}
      fallback={
        <div
          class={className()}
          classList={{ "yohu-interactive--selected": Boolean(host()["data-selected"]) }}
          data-size={host()["data-size"]}
          role="option"
          aria-selected={host()["aria-selected"]}
          aria-label={props.label}
          tabIndex={props.tabIndex}
          onClick={props.onClick}
          onKeyDown={props.onKeyDown}
        >
          {body()}
        </div>
      }
    >
      <button
        type="button"
        class={className()}
        classList={{ "yohu-interactive--selected": Boolean(host()["data-selected"]) }}
        data-size={host()["data-size"]}
        aria-current={host()["aria-current"]}
        aria-label={props.label}
        tabIndex={props.tabIndex}
        onClick={props.onClick}
        onKeyDown={props.onKeyDown}
      >
        {body()}
      </button>
    </Show>
  );
}
