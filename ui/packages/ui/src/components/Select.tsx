/**
 * YoSelect —— 自绘下拉选择框（L4 视图 / L5 门面）。
 * HarmonyOS 对照：Select。落点在 select-place → popover-place；选中在 select-model；开合/键盘/禁用在 select-policy。
 * 受控 API：options / value / onChange / disabled / placeholder / block。
 * 默认 hug 选中文案；最小宽在触发钮上（禁止写在根上，否则短文案按钮靠左）。
 *
 * 交互：
 * - 点击展开、点击外部关闭、Esc 关闭（逐层退出）
 * - 展开后 ↑/↓ 移动活动选项（aria-activedescendant）、Home/End 首尾、
 *   Enter/Space 选择、Tab 关闭并提交活动选项
 * - 触发钮 `aria-haspopup=listbox aria-expanded`；菜单 `role=listbox`；选项 `role=option`
 * - 菜单 Portal 到 body；宽 hug 内容（min=触发钮）；高 hug 内容，仅超出视口才纵向滚动
 */
import { For, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "../icons";
import { YoIndicator } from "../motion/indicator";
import { YoPresence } from "../motion/presence";
import { Layout } from "../tokens/layout";
import { YoTooltip } from "./Tooltip";
import {
  findOption,
  optionDomId,
  type SelectMenuLayout,
  type YoSelectOption,
} from "./select-model";
import { layoutSelectMenu, readSelectTrigger } from "./select-place";
import {
  applySelectEscape,
  applySelectHover,
  applySelectKey,
  idleSelectSession,
  selectHostAttrs,
  toggleSelect,
  type SelectSession,
} from "./select-policy";
import "./Select.css";

export type { YoSelectOption };

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
      readSelectTrigger(trigger),
      { optionCount: props.options.length, scrollHeight: menu.scrollHeight },
      layer,
    );
    setPlacement(laid.placement);
    setOverflowY(laid.overflowY);
    setMenuStyle(laid.style as JSX.CSSProperties);
  };

  const commitValue = (value: string): void => {
    props.onChange?.(value);
    setSession(idleSelectSession());
    triggerRef?.focus();
  };

  const openMenu = (): void => {
    setSession((cur) => toggleSelect(cur.open, props.options, props.value, props.disabled));
  };

  onMount(() => {
    const handleDocPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (rootRef?.contains(target) || layerRef?.contains(target)) return;
      setSession(idleSelectSession());
    };
    const handleDocKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const next = applySelectEscape(open(), props.disabled);
      if (!next) return;
      // 逐层退出契约：菜单打开时本层为“最内浮层”，Esc 只消费本层的 Esc 并向下收口。
      // stopImmediatePropagation 在 document (capture) 阶段阻断后续同节点监听器（含外层 Dialog 的 document 级 Esc），
      // 使这一次 Esc 只关闭本 Select；外层 Dialog 在菜单关闭后的下一次 Esc 才收到事件并退出。
      event.preventDefault();
      event.stopImmediatePropagation();
      setSession(next);
      triggerRef?.focus();
    };
    document.addEventListener("mousedown", handleDocPointerDown);
    document.addEventListener("keydown", handleDocKeyDown, true);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleDocPointerDown);
      document.removeEventListener("keydown", handleDocKeyDown, true);
    });
  });

  createEffect(() => {
    if (!open()) return;
    const frame = requestAnimationFrame(() => syncMenuPlace());
    const onRelayout = (): void => syncMenuPlace();
    window.addEventListener("resize", onRelayout);
    window.addEventListener("scroll", onRelayout, true);
    window.visualViewport?.addEventListener("resize", onRelayout);
    window.visualViewport?.addEventListener("scroll", onRelayout);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onRelayout);
      window.removeEventListener("scroll", onRelayout, true);
      window.visualViewport?.removeEventListener("resize", onRelayout);
      window.visualViewport?.removeEventListener("scroll", onRelayout);
    });
  });

  const host = createMemo(() => selectHostAttrs({ disabled: props.disabled, block: props.block }));

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    const effect = applySelectKey(event.key, session(), props.options, props.value, props.disabled);
    if (effect.type === "none") return;
    event.preventDefault();
    if (effect.type === "commit") {
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
      <YoTooltip
        content={selected()?.label ?? props.placeholder ?? ""}
        disabled={Boolean(props.disabled) || !(selected()?.label || props.placeholder)}
        block={props.block}
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
        <span
          class="yohu-select__value"
          data-placeholder={selected() ? undefined : ""}
        >
          {selected()?.label ?? props.placeholder ?? ""}
        </span>
        <span class="yohu-select__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={Layout.IconInline} />
        </span>
      </button>
      </YoTooltip>
      <Portal mount={document.body}>
        <YoPresence when={open()} recipe="popover">
          <div
            ref={(el) => {
              layerRef = el;
              if (el) syncMenuPlace();
            }}
            class="yohu-select__layer"
            data-placement={placement()}
            data-overflow-y={overflowY() ? "" : undefined}
            style={menuStyle()}
          >
            <div
              ref={(el) => {
                menuRef = el;
                if (el) syncMenuPlace();
              }}
              class="yohu-select__menu"
              data-placement={placement()}
              role="listbox"
            >
              <YoIndicator follow={props.value} variant="fill" />
              <For each={props.options}>
                {(option, index) => (
                  <div
                    id={optionDomId(option.value)}
                    class="yohu-select__option yohu-interactive"
                    classList={{
                      "yohu-interactive--selected": option.value === props.value,
                      "yohu-interactive--active": index() === activeIndex(),
                    }}
                    role="option"
                    aria-selected={option.value === props.value}
                    onMouseEnter={() => setSession((cur) => ({ ...cur, activeIndex: applySelectHover(index()) }))}
                    onClick={() => commitValue(option.value)}
                  >
                    <span class="yohu-select__option-label">{option.label}</span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </YoPresence>
      </Portal>
    </div>
  );
}
