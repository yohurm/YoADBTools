/**
 * YoColFrame —— 清单列轨宿主。
 * 只写一次 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`。
 * 表头 YoColRow、清单 YoColTrack / YoColCell 都吃这两条变量。
 * 不是 YoTable：清单体仍是 YoVirtualList。
 */
import type { JSX } from "solid-js";
import "./ColFrame.css";

export interface YoColFrameProps {
  template: string;
  class?: string;
  children: JSX.Element;
}

/**
 * 把轨道字符串落到父级 CSS 变量。子行不要再各自写 grid-template-columns。
 */
export function YoColFrame(props: YoColFrameProps): JSX.Element {
  return (
    <div
      class={`yohu-col-frame${props.class ? ` ${props.class}` : ""}`}
      style={{ "--yohu-col-tracks": props.template }}
    >
      {props.children}
    </div>
  );
}
