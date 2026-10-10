/**
 * YoSelect —— 自绘下拉选择框（L4 视图 / L5 门面）。
 * HarmonyOS 对照：Select。落点在 select-place → popover-place；选中在 select-model；开合/键盘/禁用在 select-policy。
 * 受控 API：options / value / onChange / disabled / placeholder / block。
 * 选项可带 description（次文案）。block 触发钮才画出，菜单项始终画。
 * 默认 hug 文案簇（字 + 箭头）；禁止给 hug 写 min-width（短文案会被拉开）。
 * block 才让文案吃剩余、次文案与箭头贴尾。宿主是 button；YoCorner 只 paint。
 * 触发钮圆角 32，带描边和轻阴影。下拉菜单是特殊铬，圆角 16。
 * 文案与箭头在钮上，禁止 clip-path 裁箭头。
 * 菜单宽至少等于触发钮；短钮按最长选项撑开，超过菜单帽才省略。
 * 选中只画尾部勾。打开时不画悬停洗；指针移入或方向键离开后才画。
 * 项间分割线由行模型的 rule 决定，末项没有。
 *
 * 交互：
 * - 点击展开、点击外部关闭、Esc 关闭（逐层退出）
 * - 展开后 ↑/↓ 移动活动选项（aria-activedescendant）、Home/End 首尾、
 *   Enter/Space 选择、Tab 关闭并提交活动选项
 * - 触发钮 `aria-haspopup=listbox aria-expanded`；菜单 `role=listbox`；选项 `role=option`
 * - 菜单 Portal 到 body；宽至少等于触发钮，短钮按文案撑开；高 hug 内容，上限视口 80%
 */
import { presenceAttr, presenceIsOn } from "../dom/flag";
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { YoCorner } from "../corner";
import "../menu/menu-row.css";
import { Icon } from "../icons";
import { YoPresence } from "../motion/engines/presence";
import { Layout } from "../tokens/layout";
import { Radius } from "../tokens/radius";
import {
  findOption,
  optionDescription,
  optionDomId,
  selectMenuRows,
  type SelectMenuLayout,
  type YoSelectOption,
} from "./select-model";
import { dismissKey } from "../keymap/list-index";
import { layoutSelectMenu } from "./select-place";
import { readAnchorBox } from "../placement/anchor";
import {
  applySelectEscape,
  applySelectKey,
  idleSelectSession,
  optionIsHot,
  pointSelect,
  selectEffectIsCommit,
  selectEffectIsNone,
  selectHostAttrs,
  toggleSelect,
  type SelectSession,
} from "./select-policy";
import "./Select.css";

export type { YoSelectOption };

/** Solid `style` 走 setProperty，必须 kebab；L3 仍返回 popoverLayerStyle 原样。 */
function selectLayerStyle(style: Record<string, string>): JSX.CSSProperties {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(style)) {
    next[key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)] = value;
  }
  return next;
}

export interface YoSelectProps {
  /** 选项列表 */
  options: YoSelectOption[];
  /** 当前值 */
  value?: string | null;
  /** 选择回调 */
  onChange?: (value: string) => void;
  /** 禁用 */
  disabled?: boolean;
  /** 未选中时的占位文本 */
  placeholder?: string;
  /** 拉满父级宽度（表单行）；默认 hug 选中文案 */
  block?: boolean;
}

/**
 * 渲染一个自绘下拉选择框。
 */
export function YoSelect(props: YoSelectProps): JSX.Element {
  const [session, setSession] = createSignal<SelectSession>(idleSelectSession());
  const [placement, setPlacement] = createSignal<SelectMenuLayout["placement"]>("bottom");
  const [overflowY, setOverflowY] = createSignal(false);
  const [menuStyle, setMenuStyle] = createSignal<JSX.CSSProperties>({});
  let rootRef: HTMLDivElement | undefined;
  let triggerRef: HTMLButtonElement | undefined;
  let layerRef: HTMLDivElement | undefined;
  let menuRef: HTMLDivElement | undefined;

  const selected = (): YoSelectOption | undefined => findOption(props.options, props.value);
  const selectedMeta = (): string | undefined => optionDescription(selected());
  const open = (): boolean => session().open;
  const activeIndex = (): number => session().activeIndex;

  const activeValue = (): string => {
    const idx = activeIndex();
    if (idx >= 0 && props.options[idx]) return props.options[idx]!.value;
    return props.value ?? "";
  };

  const syncMenuPlace = (): void => {
    const trigger = triggerRef;
    const layer = layerRef;
    const menu = menuRef;
    if (!trigger || !layer || !menu) return;
    const laid = layoutSelectMenu(
      readAnchorBox(trigger),
      {
        optionCount: props.options.length,
        scrollHeight: menu.scrollHeight,
        labels: props.options.map((option) => option.label),
        descriptions: props.options.map((option) => optionDescription(option) ?? ""),
      },
    );
    setPlacement(laid.placement);
    setOverflowY(laid.overflowY);
    setMenuStyle(selectLayerStyle(laid.style));
  };

  function selectIdle(): void {
    setSession(idleSelectSession());
  }

  function selectFocusTrigger(): void {
    triggerRef?.focus();
  }

  function selectPlacement(): SelectMenuLayout["placement"] {
    return placement();
  }

  function placeIfMounted(el: HTMLElement | undefined): void {
    if (el) syncMenuPlace();
  }

  function selectDescription(text: () => string): JSX.Element {
    return <span class="yohu-select__description">{text()}</span>;
  }

  const commitValue = (value: string): void => {
    props.onChange?.(value);
    selectIdle();
    selectFocusTrigger();
  };

  const openMenu = (): void => {
    setSession((cur) => toggleSelect(cur.open, props.options, props.value, props.disabled));
  };

  function listen(
    target: EventTarget | null | undefined,
    type: string,
    handler: () => void,
    capture?: boolean,
  ): () => void;
  function listen(
    target: EventTarget | null | undefined,
    type: string,
    handler: (event: MouseEvent) => void,
    capture?: boolean,
  ): () => void;
  function listen(
    target: EventTarget | null | undefined,
    type: string,
    handler: (event: KeyboardEvent) => void,
    capture?: boolean,
  ): () => void;
  function listen(
    target: EventTarget | null | undefined,
    type: string,
    handler: () => void,
    capture?: boolean,
  ): () => void {
    target?.addEventListener(type, handler, capture);
    return () => target?.removeEventListener(type, handler, capture);
  }

  onMount(() => {
    const handleDocPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (rootRef?.contains(target) || layerRef?.contains(target)) return;
      selectIdle();
    };
    const handleDocKeyDown = (event: KeyboardEvent): void => {
      if (!dismissKey(event.key)) return;
      const next = applySelectEscape(open(), props.disabled);
      if (!next) return;
      // 逐层退出契约：菜单打开时本层为“最内浮层”，Esc 只消费本层的 Esc 并向下收口。
      // stopImmediatePropagation 在 document (capture) 阶段阻断后续同节点监听器（含外层 Dialog 的 document 级 Esc），
      // 使这一次 Esc 只关闭本 Select；外层 Dialog 在菜单关闭后的下一次 Esc 才收到事件并退出。
      event.preventDefault();
      event.stopImmediatePropagation();
      setSession(next);
      selectFocusTrigger();
    };
    const stopDocPointerDown = listen(document, "mousedown", handleDocPointerDown);
    const stopDocKeyDown = listen(document, "keydown", handleDocKeyDown, true);
    onCleanup(() => {
      stopDocPointerDown();
      stopDocKeyDown();
    });
  });

  createEffect(() => {
    if (!open()) {
      setMenuStyle({});
      return;
    }
    const frame = requestAnimationFrame(() => syncMenuPlace());
    const onRelayout = (): void => syncMenuPlace();
    const stopWindowResize = listen(window, "resize", onRelayout);
    const stopWindowScroll = listen(window, "scroll", onRelayout, true);
    const stopViewportResize = listen(window.visualViewport, "resize", onRelayout);
    const stopViewportScroll = listen(window.visualViewport, "scroll", onRelayout);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      stopWindowResize();
      stopWindowScroll();
      stopViewportResize();
      stopViewportScroll();
    });
  });

  const host = createMemo(() => selectHostAttrs({ disabled: props.disabled, block: props.block }));
  const rows = createMemo(() => selectMenuRows(props.options, props.value));

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    const effect = applySelectKey(event.key, session(), props.options, props.value, props.disabled);
    if (selectEffectIsNone(effect)) return;
    event.preventDefault();
    if (selectEffectIsCommit(effect)) {
      commitValue(effect.value);
      return;
    }
    setSession(effect.session);
  };

  return (
    <div
      ref={(el) => (rootRef = el)}
      class="yohu-select"
      data-disabled={host()["data-disabled"]}
      data-block={host()["data-block"]}
    >
      <button
        ref={(el) => (triggerRef = el)}
        type="button"
        class="yohu-select__trigger yohu-focus-ring"
        disabled={props.disabled}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-activedescendant={open() ? optionDomId(activeValue()) : undefined}
        onClick={openMenu}
        onKeyDown={onTriggerKeyDown}
      >
        <YoCorner mode="paint" role="control" radius={Radius.Xl} class="yohu-select__chrome" />
        <span
          class="yohu-select__value"
          data-placeholder={selected() ? undefined : ""}
        >
          {selected()?.label ?? props.placeholder ?? ""}
        </span>
        <Show when={presenceIsOn(host()["data-block"]) && selectedMeta()}>
          {(meta) => selectDescription(meta)}
        </Show>
        <span class="yohu-select__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={Layout.IconInline} />
        </span>
      </button>
      <Portal mount={document.body}>
        <YoPresence when={open()} recipe="popover">
          <div
            ref={(el) => {
              layerRef = el;
              placeIfMounted(el);
            }}
            class="yohu-select__layer"
            data-placement={selectPlacement()}
            data-overflow-y={presenceAttr(overflowY())}
            data-placed={presenceAttr(menuStyle().position)}
            style={menuStyle()}
          >
            <div
              ref={(el) => {
                menuRef = el;
                placeIfMounted(el);
              }}
              class="yohu-select__menu"
              data-enter="rise"
              data-placement={selectPlacement()}
              role="listbox"
            >
              <YoCorner
                role="card"
                class="yohu-select__menu-chrome"
                overflow={overflowY() ? "auto" : "hidden"}
              >
                <div class="yohu-menu-well">
                <For each={rows()}>
                  {(row, index) => (
                    <div
                      id={row.id}
                      class="yohu-select__option yohu-menu-row yohu-interactive"
                      classList={{
                        "yohu-interactive--active": optionIsHot(session(), index()),
                      }}
                      data-selected={presenceAttr(row.selected)}
                      data-rule={presenceAttr(row.rule)}
                      role="option"
                      aria-selected={row.selected}
                      onMouseEnter={() => setSession((cur) => pointSelect(cur, index()))}
                      onClick={() => commitValue(row.value)}
                    >
                      <span class="yohu-select__option-label">{row.label}</span>
                      <Show when={row.description}>
                        {(meta) => selectDescription(meta)}
                      </Show>
                      <span class="yohu-select__mark" aria-hidden="true">
                        <Icon name="check" size={Layout.IconInline} />
                      </span>
                    </div>
                  )}
                </For>
                </div>
              </YoCorner>
            </div>
          </div>
        </YoPresence>
      </Portal>
    </div>
  );
}
