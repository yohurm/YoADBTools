/**
 * YoColFrame —— 清单列轨宿主。
 * 只写一次 `--yohu-col-tracks` 与 `--yohu-col-cell-pad`。
 * 默认 `cellPad=list`：列垫左 md / 右 sm，表头与格子同一起笔。
 * Family A（日志文档）表头 cellPad=none + tone=document，轨道是探针 px；行是官方 Format 文档，不把列垫写进 Document.text。
 * Family B（文件）走 list，行是 YoColTrack / YoColCell。
 * 不是 YoTable：清单体仍是 YoVirtualList。
 */
import type { JSX } from "solid-js";
import type { YoListRowTone } from "../list-row/list-row-model";
import { resolveColHeaderTone } from "./col-header-model";
import type { YoColCellPad } from "./col-model";
import "./ColFrame.css";
import "./ColHead.css";

export type { YoColCellPad };

export interface YoColFrameProps {
  template: string;
  /** 默认 list。日志表头是铬层；文档轨道走 Format.width() 换成 px，禁止再为对齐标题把列垫写进文档。 */
  cellPad?: YoColCellPad;
  /** list = 文件格子；document = 日志文档表头，等宽 caption 跟 Document 同一把尺。 */
  tone?: YoListRowTone;
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
      data-tone={resolveColHeaderTone(props.tone)}
      style={{ "--yohu-col-tracks": props.template }}
    >
      {props.children}
    </div>
  );
}

export interface YoColHeadProps {
  class?: string;
  children: JSX.Element;
}

/**
 * 横滑表头的裁切盒。侧轨垫打在这一层，里面的 YoColRow 只平移。
 * 不横滑的表头直接用 YoColRow，不必再包。
 */
export function YoColHead(props: YoColHeadProps): JSX.Element {
  return <div class={props.class ? `yohu-col-head ${props.class}` : "yohu-col-head"}>{props.children}</div>;
}
