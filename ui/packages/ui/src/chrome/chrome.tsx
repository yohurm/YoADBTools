/**
 * YoChrome —— 模块页眉（L4 视图）。
 * 投放忽略与槽位由 chrome-policy 决定。
 * leading / 功能栏进出走 Presence chip；次行仍 Show。
 * 设备名由调用方在 leading 组合 YoBadge。本容器不 import 产品 Yo*。
 * 主行高度走 --yohu-control-height；无按钮页也同一占位。
 */
import { Show, createMemo, createRenderEffect, createSignal, type JSX } from "solid-js";

import { YoListPresence, YoPresence } from "../motion/engines/presence";
import { chromeHostAttrs, resolveChromeSlots } from "./chrome-policy";
import "./chrome.css";

export interface YoChromeAction {
  key: string;
  node: JSX.Element;
}

export interface YoChromeProps {
  /** 模块功能标题 */
  title: string;
  /** 标题旁附加（选中设备走 YoBadge tone=neutral） */
  leading?: JSX.Element;
  /** 主行功能栏（≤6 个操作；HarmonyOS C 栏上限）。身份 key 驱动 chip 进出。 */
  actions?: readonly YoChromeAction[];
  /** 次行（过滤等次要控件）；可折行，不进主行 */
  extra?: JSX.Element;
  /** 文件拖入命中忽略（页眉不当投放目标） */
  dropIgnore?: boolean;
}

/** 渲染模块页眉：主行左侧标题区、右侧功能栏；可选次行。无操作时只显示标题区。 */
export function YoChrome(props: YoChromeProps): JSX.Element {
  const input = createMemo(() => ({
    hasLeading: props.leading != null,
    hasBar: (props.actions?.length ?? 0) > 0,
    hasExtra: Boolean(props.extra),
    dropIgnore: props.dropIgnore,
  }));
  const host = createMemo(() => chromeHostAttrs(input()));
  const slots = createMemo(() => resolveChromeSlots(input()));
  const [heldLeading, setHeldLeading] = createSignal<JSX.Element | undefined>(undefined);

  createRenderEffect(() => {
    const next = props.leading;
    if (next != null) setHeldLeading(() => next);
  });

  return (
    <header
      class="yohu-chrome"
      data-drop={host()["data-drop"]}
    >
      <div class="yohu-chrome__row">
        <div class="yohu-chrome__title">
          <span class="yohu-chrome__heading">{props.title}</span>
          <YoPresence
            when={slots().showLeading}
            recipe="chip"
            onExitComplete={() => {
              if (!slots().showLeading) setHeldLeading(undefined);
            }}
          >
            <span class="yohu-chrome__leading">{heldLeading()}</span>
          </YoPresence>
        </div>
        <div class="yohu-chrome__bar">
          <YoListPresence each={props.actions ?? []} key={(item) => item.key} recipe="chip">
            {(item) => item.node}
          </YoListPresence>
        </div>
      </div>
      <Show when={slots().showExtra}>
        <div class="yohu-chrome__extra">{props.extra}</div>
      </Show>
    </header>
  );
}
