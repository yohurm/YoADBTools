/**
 * YoChrome —— 模块页眉（L4 视图）。
 * 布局 / 设备徽章 / 投放忽略由 chrome-model + chrome-policy 决定；本文件只绑属性与槽位。
 * 主行高度走 --yohu-control-height；无按钮页也同一占位。
 */
import { Show, createMemo, type JSX } from "solid-js";
import { YoBadge } from "./Badge";
import { chromeHostAttrs, resolveChromeSlots } from "./chrome-policy";
import "./chrome.css";

export interface YoChromeProps {
  /** 模块功能标题 */
  title: string;
  /** 选中设备展示名（标题后中性徽章；无选中不传） */
  deviceLabel?: string;
  /** 标题旁附加（设备徽章以外的补充） */
  leading?: JSX.Element;
  /** 主行功能栏（≤6 个操作；HarmonyOS C 栏上限） */
  children?: JSX.Element;
  /** 次行（过滤等次要控件）；可折行，不进主行 */
  extra?: JSX.Element;
  /** 文件拖入命中忽略（页眉不当投放目标） */
  dropIgnore?: boolean;
}

/** 渲染模块页眉：主行左侧标题区、右侧功能栏；可选次行。无操作时只显示标题区。 */
export function YoChrome(props: YoChromeProps): JSX.Element {
  const input = createMemo(() => ({
    deviceLabel: props.deviceLabel,
    hasBar: Boolean(props.children),
    hasExtra: Boolean(props.extra),
    dropIgnore: props.dropIgnore,
  }));
  const host = createMemo(() => chromeHostAttrs(input()));
  const slots = createMemo(() => resolveChromeSlots(input()));

  return (
    <header
      class="yohu-chrome"
      data-layout={host()["data-layout"]}
      data-drop={host()["data-drop"]}
    >
      <div class="yohu-chrome__row">
        <div class="yohu-chrome__title">
          <span class="yohu-module-title">{props.title}</span>
          <Show when={slots().showDevice}>
            <span class="yohu-chrome__device">
              <YoBadge text={props.deviceLabel ?? ""} tone="neutral" />
            </span>
          </Show>
          {props.leading}
        </div>
        <Show when={slots().showBar}>
          <div class="yohu-chrome__bar">{props.children}</div>
        </Show>
      </div>
      <Show when={slots().showExtra}>
        <div class="yohu-chrome__extra">{props.extra}</div>
      </Show>
    </header>
  );
}
