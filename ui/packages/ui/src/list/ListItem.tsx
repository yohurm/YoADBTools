/**
 * YoListItem —— 效率型列表行（L4）。
 * HarmonyOS 对照：ListItem。选中走配方 selected（软底绽开、强调条展开/收回、字色非线性、导航图标 DOWN）。
 * 模块不再自挂 button 皮。
 */
import { presenceAttr, presenceIsOn } from "../dom/flag";
import { Show, createEffect, createMemo, createSignal, on } from "solid-js";
import type { JSX } from "solid-js";
import { useRail, railStreamAttr } from "../motion/engines/rail";
import { listItemHostAttrs } from "./list-item-policy";
import {
  listItemRingIsInset,
  listItemRoleIsButton,
  listItemSizeIsNav,
  type YoListItemRing,
  type YoListItemRole,
  type YoListItemSize,
} from "./list-item-model";
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

  function selectedNow(): boolean {
    return presenceIsOn(host()["data-selected"]);
  }

  function selectedClass() {
    return { "yohu-interactive--selected": selectedNow() };
  }

  function itemSize(): YoListItemSize {
    return host()["data-size"];
  }

  function itemLabel(): string | undefined {
    return props.label;
  }

  function itemTabIndex(): number | undefined {
    return props.tabIndex;
  }

  function forwardItemClick(event: MouseEvent): void {
    props.onClick?.(event);
  }

  function forwardItemKey(event: KeyboardEvent): void {
    props.onKeyDown?.(event);
  }

  function itemRailPart() {
    return "rail";
  }

  function itemSubPart() {
    return "sub";
  }

  const className = (): string => {
    const ring = listItemRingIsInset(host()["data-ring"]) ? "yohu-focus-ring--inset" : "yohu-focus-ring";
    const extra = props.class ? ` ${props.class}` : "";
    return `yohu-list-item yohu-interactive yohu-recipe-selected ${ring}${extra}`;
  };

  const [iconBounce, setIconBounce] = createSignal(false);
  let bounceBound = false;
  function clearIconBounce(): void {
    setIconBounce(false);
  }
  function markBounceBound(): void {
    bounceBound = true;
  }
  createEffect(
    on(
      () => selectedNow(),
      (selected) => {
        if (!listItemSizeIsNav(itemSize())) {
          clearIconBounce();
          markBounceBound();
          return;
        }
        if (!bounceBound) {
          markBounceBound();
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
            data-bounce={presenceAttr(iconBounce())}
            onAnimationEnd={(event) => {
              if (event.animationName === "yohu-bounce-down") {
                clearIconBounce();
              }
            }}
          >
            {leading()}
          </span>
        )}
      </Show>
      <span class="yohu-list-item__info" data-part={itemRailPart()}>
        <span class="yohu-list-item__title" data-part="title">
          {props.title}
        </span>
        <Show when={props.description || props.meta}>
          <span class="yohu-list-item__extra" data-part={itemRailPart()}>
            <span class="yohu-list-item__extra-inner">
              <span class="yohu-list-item__extra-content">
                <Show when={props.description}>
                  {(description) => (
                    <span class="yohu-list-item__description" data-part={itemSubPart()}>
                      {description()}
                    </span>
                  )}
                </Show>
                <Show when={props.meta}>
                  {(meta) => (
                    <span class="yohu-list-item__meta" data-part={itemSubPart()}>
                      {meta()}
                    </span>
                  )}
                </Show>
              </span>
            </span>
          </span>
        </Show>
      </span>
      <Show when={props.trailing}>
        {(trailing) => (
          <span class="yohu-list-item__end" data-part={itemRailPart()}>
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
      when={listItemRoleIsButton(host().role)}
      fallback={
        <div
          class={className()}
          classList={selectedClass()}
          data-size={itemSize()}
          data-stream={stream()}
          role="option"
          aria-selected={host()["aria-selected"]}
          aria-label={itemLabel()}
          tabIndex={itemTabIndex()}
          onClick={forwardItemClick}
          onKeyDown={forwardItemKey}
        >
          {body()}
        </div>
      }
    >
      <button
        type="button"
        class={className()}
        classList={selectedClass()}
        data-size={itemSize()}
        data-stream={stream()}
        aria-current={host()["aria-current"]}
        aria-label={itemLabel()}
        tabIndex={itemTabIndex()}
        onClick={forwardItemClick}
        onKeyDown={forwardItemKey}
      >
        {body()}
      </button>
    </Show>
  );
}
