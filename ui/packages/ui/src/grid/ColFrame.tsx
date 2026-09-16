/**
 * YoColFrame —— 清单列轨宿主。
 * 只写一次 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`。
 * 默认 `cellPad=list`：列垫左 md / 右 sm，表头与格子同一起笔。
 * Family A（日志文档）把同一左垫收进 `padLeftChars`，禁止 `cellPad=none` 把标题贴边。
 * Family B（文件）走 list，行是 YoColTrack / YoColCell。
 * 不是 YoTable：清单体仍是 YoVirtualList。
 */
import type { JSX } from "solid-js";
import "./ColFrame.css";

export type YoColCellPad = "list" | "none";

export interface YoColFrameProps {
  template: string;
  /** 默认 list。日志文档禁止 none：左垫已进 padLeftChars，none 会把标题贴边。 */
  cellPad?: YoColCellPad;
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
      data-cell-pad={props.cellPad ?? "list"}
      style={{ "--yohu-col-tracks": props.template }}
    >
      {props.children}
    </div>
  );
}
