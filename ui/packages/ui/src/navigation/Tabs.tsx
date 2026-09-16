/**
 * YoTabs —— 多会话标签页（L4 视图）。
 * HarmonyOS 对照：Tabs；激活项 Accent 下划线由 YoIndicator 滑动。
 * 受控 API：tabs / activeId / onActivate / onClose / onNew / onContextMenu。
 *
 * 可达性：
 * - `role=tablist/tab` + `aria-selected` + **roving tabindex**（仅激活 tab 在 Tab 序中）
 * - ←/→ 循环切换（自动激活）；Home/End 首尾；Delete 关闭（提供 onClose 时，自动聚焦相邻）
 * - 关闭按钮 `aria-label=close`；`+` 新建按钮 `aria-label=new tab`
 *
 * 视觉：激活是 underline，不是选中实底；hover 只走 yohu-interactive / ripple。
 */
import { For } from "solid-js";
import type { JSX } from "solid-js";
import { Icon } from "../icons";
import { Layout } from "../tokens/layout";
import { YoIndicator } from "../motion/indicator";
import { resolveTabsChrome, resolveTabsKeyAction, tabsTabAttrs } from "./tabs-policy";
import "./Tabs.css";

/** 圆点色调 */
export type YoTabDotTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface YoTabDot {
  /** 圆点语义色调 */
  tone: YoTabDotTone;
}

export interface YoTabItem {
  /** 标签唯一 id */
  id: string;
  /** 标签标题 */
  title: string;
  /** 状态圆点 */
  dot?: YoTabDot;
}

export interface YoTabsProps {
  /** 标签列表 */
  tabs: YoTabItem[];
  /** 激活标签 id */
  activeId?: string | null;
  /** 激活回调 */
  onActivate?: (id: string) => void;
  /** 关闭回调（提供时显示 ×） */
  onClose?: (id: string) => void;
  /** 新建回调（提供时显示 +） */
  onNew?: () => void;
  /** 标签右键菜单（id + 原始事件；由调用方定位菜单） */
  onContextMenu?: (id: string, event: MouseEvent) => void;
}

/**
 * 渲染一条多会话标签页栏。
 */
export function YoTabs(props: YoTabsProps): JSX.Element {
  let tablistRef: HTMLDivElement | undefined;

  const chrome = () => resolveTabsChrome(props);

  const focusIndex = (index: number): void => {
    const tab = props.tabs[index];
    if (!tab) return;
    const el = tablistRef?.querySelector<HTMLElement>(`[data-tab-id="${tab.id}"]`);
    el?.focus();
  };

  const onTablistKeyDown = (event: KeyboardEvent): void => {
    const action = resolveTabsKeyAction(event.key, props.tabs, props.activeId, chrome().canClose);
    if (!action) return;
    event.preventDefault();
    if (action.type === "activate") {
      props.onActivate?.(action.id);
      focusIndex(action.focusIndex);
      return;
    }
    props.onClose?.(action.id);
    focusIndex(action.focusIndex);
  };

  return (
    <div
      ref={(el) => {
        tablistRef = el;
      }}
      class="yohu-tabs"
      role="tablist"
      aria-label="会话"
      onKeyDown={onTablistKeyDown}
    >
      <YoIndicator follow={props.activeId} variant="underline" selector=".yohu-tabs__tab[data-active]" />
      <For each={props.tabs}>
        {(tab) => {
          const attrs = () => tabsTabAttrs(tab.id, props.activeId);
          return (
            <div
              data-tab-id={tab.id}
              data-active={attrs().active ? "" : undefined}
              class="yohu-tabs__tab yohu-interactive yohu-focus-ring--inset"
              role="tab"
              aria-selected={attrs()["aria-selected"]}
              tabindex={attrs().tabindex}
              onClick={() => props.onActivate?.(tab.id)}
              onContextMenu={(event) => props.onContextMenu?.(tab.id, event)}
            >
              {tab.dot ? (
                <span class="yohu-tabs__dot" data-tone={tab.dot.tone} />
              ) : null}
              <span class="yohu-tabs__title">{tab.title}</span>
              {chrome().canClose ? (
                <button
                  type="button"
                  class="yohu-tabs__close yohu-interactive yohu-focus-ring"
                  aria-label="关闭页签"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onClose?.(tab.id);
                  }}
                >
                  <Icon name="close" size={Layout.IconTiny} />
                </button>
              ) : null}
            </div>
          );
        }}
      </For>
      {chrome().canNew ? (
        <button type="button" class="yohu-tabs__new yohu-interactive yohu-focus-ring" aria-label="新建页签" onClick={props.onNew}>
          <Icon name="plus" size={Layout.IconInline} />
        </button>
      ) : null}
    </div>
  );
}
