/**
 * YoColRow —— 表头行列轨道宿主。
 * 统一 grid-template-columns；清单行仍用同一 template 字符串，不套本组件。
 */
import type { JSX } from "solid-js";
import "./ColRow.css";

export interface YoColRowProps {
  template: string;
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
      style={{ "grid-template-columns": props.template }}
    >
      {props.children}
    </div>
  );
}
