/**
 * YoTitleBar —— HarmonyOS 电脑窗口容器层（L4 视图）。
 * 品牌 / 三键涂装由 titlebar-model + titlebar-policy 决定；本文件只绑属性与内容区。
 * 三键贴边满高，禁止 padding 缩进关闭钮；色/圆角锁鸿蒙 token。
 */
import { For, Show, createMemo, type JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import { resolveTitleBarSpec } from "./titlebar-model";
import {
  isCaptionTarget,
  titlebarCaptionButtons,
  titlebarHostAttrs,
  type TitleBarCaptionButton,
} from "./titlebar-policy";
import { YoTooltip } from "./Tooltip";
import "./TitleBar.css";

export interface YoTitleBarProps {
  /** 窗口名称 */
  title: string;
  /** 应用图标（组件库字形；与 logoSrc 同时存在时以 logoSrc 为准） */
  icon?: IconName;
  /** 应用位图图标（安装包/关于页同源） */
  logoSrc?: string;
  /** 中区留白（模块工具栏在内容区 YoChrome，不进标题栏） */
  children?: JSX.Element;
  /** 三键左侧操作（最多 3 个图标） */
  actions?: JSX.Element;
  /** 是否最大化（切换还原图标） */
  maximized?: boolean;
  /** 最小化 */
  onMinimize?: () => void;
  /** 最大化 / 还原 */
  onToggleMaximize?: () => void;
  /** 关闭 */
  onClose?: () => void;
  /** true：隐藏自定义三键，左侧让出系统交通灯（macOS Overlay） */
  nativeCaptions?: boolean;
}

function onCaption(kind: TitleBarCaptionButton["kind"], props: YoTitleBarProps): void {
  if (kind === "min") props.onMinimize?.();
  else if (kind === "max") props.onToggleMaximize?.();
  else props.onClose?.();
}

/** 渲染 HarmonyOS 风格窗口标题栏（无系统边框时由 Application 接线拖动/三键）。 */
export function YoTitleBar(props: YoTitleBarProps): JSX.Element {
  const spec = createMemo(() => resolveTitleBarSpec(props));
  const host = createMemo(() => titlebarHostAttrs(props));
  const captions = createMemo(() => titlebarCaptionButtons(spec()));

  return (
    <header
      class="yohu-titlebar"
      data-captions={host()["data-captions"]}
      data-brand={host()["data-brand"]}
      onDblClick={(event) => {
        if (isCaptionTarget(event.target)) return;
        props.onToggleMaximize?.();
      }}
    >
      <div class="yohu-titlebar__brand" data-tauri-drag-region>
        <Show when={spec().brand === "logo"}>
          <img
            class="yohu-titlebar__logo"
            src={props.logoSrc}
            alt=""
            width={Layout.IconSm}
            height={Layout.IconSm}
            draggable={false}
          />
        </Show>
        <Show when={spec().brand === "icon"}>
          <span class="yohu-titlebar__icon" aria-hidden="true">
            <Icon name={props.icon as IconName} size={Layout.IconSm} />
          </span>
        </Show>
        <span class="yohu-titlebar__title">{props.title}</span>
      </div>
      <div class="yohu-titlebar__center" data-tauri-drag-region>
        {props.children}
      </div>
      <div class="yohu-titlebar__trailing">
        <Show when={props.actions}>
          <div class="yohu-titlebar__actions">{props.actions}</div>
        </Show>
        <Show when={spec().showCaptions}>
          <div class="yohu-titlebar__captions">
            <For each={captions()}>
              {(btn) => (
                <YoTooltip content={btn.label}>
                  <button
                    type="button"
                    class="yohu-titlebar__caption"
                    data-caption={btn.kind}
                    data-paint={btn.paint}
                    aria-label={btn.label}
                    onClick={() => onCaption(btn.kind, props)}
                  >
                    <Icon name={btn.icon} size={Layout.IconSm} />
                  </button>
                </YoTooltip>
              )}
            </For>
          </div>
        </Show>
      </div>
    </header>
  );
}
