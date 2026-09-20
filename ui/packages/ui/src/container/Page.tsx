/**
 * YoPage —— 模块页壳（L4 视图，UI设计系统-v6.md §3）。
 * 角色由 page-model + page-policy 决定；本文件只绑属性与页根。
 * 页眉必须是第一子节点，禁止与内容区作为 fragment 兄弟交给模块转场。
 */
import type { JSX } from "solid-js";
import { createMemo } from "solid-js";
import { type YoPageRole } from "./page-model";
import { pageHostAttrs } from "./page-policy";
import "./page.css";

export type { YoPageRole };

export interface YoPageProps {
  /** BEM 根（yohu-terminal / yohu-files / yohu-logs / yohu-settings）；页垫仍走 .yohu-page */
  class?: string;
  /** 缺省 module（效率型 12vp）；settings 走 page-margin + 阅读列帽 */
  role?: YoPageRole;
  /** 页根（模块快捷键作用域宿主） */
  ref?: (el: HTMLDivElement) => void;
  children: JSX.Element;
}

/** 页根：页眉 + 分区同一套页垫。设置页 role=settings 才用 40vp 左右边距。 */
export function YoPage(props: YoPageProps): JSX.Element {
  const host = createMemo(() => pageHostAttrs(props.role));
  return (
    <div
      ref={(el) => {
        const assign = props.ref;
        if (assign) assign(el);
      }}
      class={`yohu-page${props.class ? ` ${props.class}` : ""}`}
      data-role={host()["data-role"]}
      data-pad={host()["data-pad"]}
      data-column={host()["data-column"]}
    >
      {props.children}
    </div>
  );
}
