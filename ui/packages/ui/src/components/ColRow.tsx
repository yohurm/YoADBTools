/**
 * YoColRow —— 表头行列轨道。
 * 缺省继承父级 YoColFrame 的 `--yohu-col-tracks`；传入 template 则覆盖。
 */
import type { JSX } from "solid-js";
import "./ColRow.css";

export interface YoColRowProps {
  /** 缺省吃 `--yohu-col-tracks`。仅在没有 YoColFrame 时传入。 */
  template?: string;
  resizing?: boolean;
  class?: string;
  children: JSX.Element;
}

/**
 * 渲染表头一行。模块把列格（YoColHeader）作为 children。
 */
export function YoColRow(props: YoColRowProps): JSX.Element {
  return (
    <div
      class={`yohu-col-row${props.class ? ` ${props.class}` : ""}`}
      classList={{ "yohu-col-row--resizing": props.resizing === true }}
      role="row"
      style={props.template ? { "grid-template-columns": props.template } : undefined}
    >
      {props.children}
    </div>
  );
}
