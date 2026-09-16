/**
 * YoButton —— 通用按钮（L4 视图）。
 * HarmonyOS 对照：ButtonStyleMode EMPHASIZED / NORMAL / TEXTUAL
 * → solid-on / ghost-tone（灰底+语义字）与 solid-neutral / ghost-neutral。
 * 弹出框脚钮走 NORMAL（ghost+accent/danger），不是 TEXTUAL 透明。
 * 外形 / 语义色 / 禁用由 button-model + button-policy 决定；本文件只绑属性与内容区。
 * 纯文案走公开 YoSwap `anchor="center"`；加载环走 tokens/motion.css 的 yohu-spin。
 * 宿主是 button；YoCorner 只 paint。文案在 `__label` hug，禁止 clip-path 裁字。
 * paint 声明描边几何；实心底默认 `--yohu-corner-stroke: transparent`，色只走 CSS。
 */
import { Show, children, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { resolveText } from "../dom/text";
import { YoSwap } from "../motion/swap";
import type { YoButtonSize, YoButtonTone, YoButtonVariant } from "./button-model";
import { buttonHostAttrs } from "./button-policy";
import "./Button.css";

export type { YoButtonSize, YoButtonTone, YoButtonVariant };

export interface YoButtonProps {
  /** 外形：实心 / 描边 / 幽灵。默认 solid */
  variant?: YoButtonVariant;
  /** 语义色。默认 accent。outlined/ghost 不写则是彩色，不是旧 secondary/ghost */
  tone?: YoButtonTone;
  /** 尺寸 */
  size?: YoButtonSize;
  /** 加载态（spinner + 禁用 + aria-busy） */
  loading?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
  /** 原生按钮类型 */
  type?: "button" | "submit" | "reset";
  /** 展开控件（预览栏等） */
  "aria-expanded"?: boolean;
  /** 切换按下态 */
  "aria-pressed"?: boolean;
  /** 可见文案不足时的无障碍名（如级别字母）；不画气泡 */
  "aria-label"?: string;
  /** 展开控件所控制的区域 id（传输坞列表等） */
  "aria-controls"?: string;
  /** 铺满父级。默认 hug，受 `--yohu-layout-button-max` 帽宽 */
  block?: boolean;
  children: JSX.Element;
}

/** 渲染按钮。内容区 = spinner + 文案/复合 children；圆角只铺底。 */
export function YoButton(props: YoButtonProps): JSX.Element {
  const resolved = children(() => props.children);
  const text = createMemo(() => resolveText(resolved()));
  const host = createMemo(() => buttonHostAttrs(props));
  const body = () => (
    <>
      {props.loading ? <span class="yohu-button__spinner" aria-hidden="true" /> : null}
      <Show when={text() !== null} fallback={resolved()}>
        <YoSwap keys={text() as string} anchor="center">
          {text()}
        </YoSwap>
      </Show>
    </>
  );

  return (
    <button
      type={props.type ?? "button"}
      class="yohu-button yohu-focus-ring"
      data-variant={host()["data-variant"]}
      data-tone={host()["data-tone"]}
      data-size={host()["data-size"]}
      data-paint={host()["data-paint"]}
      data-block={host()["data-block"]}
      disabled={host().disabled}
      aria-busy={host()["aria-busy"]}
      aria-expanded={props["aria-expanded"]}
      aria-pressed={props["aria-pressed"]}
      aria-label={props["aria-label"]}
      aria-controls={props["aria-controls"]}
      onClick={props.onClick}
    >
      <YoCorner mode="paint" role="control" stroke class="yohu-button__chrome" />
      <span class="yohu-button__label">{body()}</span>
    </button>
  );
}
