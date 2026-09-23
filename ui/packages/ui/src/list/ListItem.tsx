/**
 * YoListItem —— 效率型列表行（L4）。
 * HarmonyOS 对照：ListItem。选中走配方 selected（软底绽开、强调条展开/收回、字色非线性、导航图标 DOWN）。
 * 模块不再自挂 button 皮。
 */
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import type { JSX } from "solid-js";
import { useRail, railStreamAttr } from "../motion/engines/rail";
import { listItemHostAttrs } from "./list-item-policy";
import type { YoListItemRing, YoListItemRole, YoListItemSize } from "./list-item-model";
import { ListItemMark } from "./Mark";
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
  const rail = useRail();
  const stream = () => (rail ? railStreamAttr(rail.phase()) : undefined);
  const host = createMemo(() =>
    listItemHostAttrs({
      role: props.role,
      size: props.size,
      ring: props.ring,
      selected: props.selected,
      current: props.current,
    }),
  );

  const className = (): string => {
    const ring = host()["data-ring"] === "inset" ? "yohu-focus-ring--inset" : "yohu-focus-ring";
    const extra = props.class ? ` ${props.class}` : "";
    return `yohu-list-item yohu-interactive yohu-recipe-selected ${ring}${extra}`;
  };

  const [iconBounce, setIconBounce] = createSignal(false);
  let bounceBound = false;
  createEffect(
    on(
      () => Boolean(props.selected),
      (selected) => {
        if (props.size !== "nav") {
          setIconBounce(false);
          bounceBound = true;
          return;
        }
        if (!bounceBound) {
          bounceBound = true;
          return;
        }
        setIconBounce(selected);
      },
    ),
  );

  const body = (): JSX.Element => (
    <>
      <ListItemMark />
      <Show when={props.leading}>
        {(leading) => (
          <span
            class="yohu-list-item__leading"
            data-bounce={iconBounce() ? "" : undefined}
            onAnimationEnd={(event) => {
              if (event.animationName === "yohu-bounce-down") {
                setIconBounce(false);
              }
            }}
          >
            {leading()}
          </span>
        )}
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
          data-stream={stream()}
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
        data-stream={stream()}
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
