/**
 * YoButton —— 通用按钮（L4 视图）。
 * 外形 / 语义色 / 禁用由 button-model + button-policy 决定；本文件只绑属性与内容区。
 * 纯文案走 YoSwap；加载环走 tokens/motion.css 的 yohu-spin。
 */
import { Show, children, createMemo } from "solid-js";
import type { JSX } from "solid-js";
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
  /** 字色与按下填充消费父级 `--yohu-button-ink` / `--yohu-button-fill` */
  ink?: boolean;
  /** 铺满父级交叉轴，自隐边框与圆角（组内容单元） */
  flush?: boolean;
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
  children: JSX.Element;
}

/** 渲染按钮。内容区 = spinner + 文案/复合 children，圆角内裁剪。 */
export function YoButton(props: YoButtonProps): JSX.Element {
  const resolved = children(() => props.children);
  const text = createMemo(() => resolveText(resolved()));
  const host = createMemo(() => buttonHostAttrs(props));

  return (
    <button
      type={props.type ?? "button"}
      class="yohu-button yohu-focus-ring"
      data-variant={host()["data-variant"]}
      data-tone={host()["data-tone"]}
      data-size={host()["data-size"]}
      data-paint={host()["data-paint"]}
      data-ink={host()["data-ink"]}
      data-flush={host()["data-flush"]}
      disabled={host().disabled}
      aria-busy={host()["aria-busy"]}
      aria-expanded={props["aria-expanded"]}
      aria-pressed={props["aria-pressed"]}
      onClick={props.onClick}
    >
      {props.loading ? <span class="yohu-button__spinner" aria-hidden="true" /> : null}
      <Show when={text() !== null} fallback={resolved()}>
        <YoSwap keys={text() as string}>{text()}</YoSwap>
      </Show>
    </button>
  );
}
