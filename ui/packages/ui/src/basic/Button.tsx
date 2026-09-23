/**
 * YoButton —— 通用按钮（L4 视图）。
 * HarmonyOS ButtonStyleMode：EMPHASIZED / NORMAL / TEXTUAL；role 由 tone=danger 表达 ERROR。
 * 弹出框脚钮走 NORMAL（comp_background_gray + 语义字），不是 TEXTUAL 透明。
 * 重要度 / 语义色 / 禁用由 button-model + button-policy 决定；本文件只绑属性与内容区。
 * 纯文案走公开 YoSwap `anchor="center"`；加载环走 tokens/motion.css 的 yohu-spin。
 * 宿主是 button；YoCorner 只 paint。文案在 `__label` hug，禁止 clip-path 裁字。
 */
import { Show, children, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { resolveText } from "../dom/text";
import { YoSpinner } from "../spinner/Spinner";
import { YoSwap } from "../motion/engines/swap";
import type { YoButtonSize, YoButtonStyle, YoButtonTone } from "./button-model";
import { buttonHostAttrs } from "./button-policy";
import "./Button.css";

export type { YoButtonSize, YoButtonStyle, YoButtonTone };

export interface YoButtonProps {
  /** 鸿蒙 buttonStyle。默认 emphasized */
  buttonStyle?: YoButtonStyle;
  /** 语义色 / role。默认 accent */
  tone?: YoButtonTone;
  /** 鸿蒙 controlSize：md=NORMAL，sm=SMALL */
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
  /** 展开控件所控制的区域 id */
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
      {props.loading ? <YoSpinner class="yohu-button__spinner" /> : null}
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
      data-style={host()["data-style"]}
      data-tone={host()["data-tone"]}
      data-size={host()["data-size"]}
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
