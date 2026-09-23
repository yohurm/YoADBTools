/**
 * YoSpinner —— 不确定进度环（共享图元，与 corner/ icons/ 同层：非产品件，任意族可消费）。
 * 彗星弧：圆头弧长伸缩（yohu-spinner-arc，loopSlow）+ 整体旋转（yohu-spin，loop），
 * 取代 border 直角环。无状态图元，不设 model/policy；色走 currentColor，轨道可选。
 */
import type { JSX } from "solid-js";
import "./Spinner.css";

export type YoSpinnerSize = "sm" | "md" | "lg";

export interface YoSpinnerProps {
  /** 尺寸档：sm=控件内 1em；md=图标格；lg=区域加载。默认 sm */
  size?: YoSpinnerSize;
  /** 画整圈底道（区域加载用；按钮内无底道）。默认关 */
  track?: boolean;
  /** 宿主 BEM 槽位名（如 yohu-loading__spinner） */
  class?: string;
}

/** 渲染彗星弧加载环。pathLength=100 归一周长，弧长与相位全在 CSS。 */
export function YoSpinner(props: YoSpinnerProps): JSX.Element {
  return (
    <span
      class={`yohu-spinner${props.class ? ` ${props.class}` : ""}`}
      data-size={props.size ?? "sm"}
      aria-hidden="true"
    >
      <svg class="yohu-spinner__svg" viewBox="0 0 24 24" fill="none">
        {props.track ? (
          <circle class="yohu-spinner__track" cx="12" cy="12" r="10" pathLength={100} />
        ) : null}
        <circle class="yohu-spinner__arc" cx="12" cy="12" r="10" pathLength={100} />
      </svg>
    </span>
  );
}
