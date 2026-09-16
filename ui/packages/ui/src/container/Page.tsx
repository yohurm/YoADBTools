/**
 * YoPage —— 效率型模块页壳（L4 视图，UI设计系统-v6.md §3）。
 * 角色由 page-model + page-policy 决定；本文件只绑属性与页根。
 * 页眉必须是第一子节点，禁止与内容区作为 fragment 兄弟交给模块转场。
 */
import type { JSX } from "solid-js";
import { pageHostAttrs } from "./page-policy";
import "./page.css";

export interface YoPageProps {
  /** BEM 根（yohu-terminal / yohu-files / yohu-logs）；页垫仍走 .yohu-page */
  class?: string;
  /** 页根（模块快捷键作用域宿主） */
  ref?: (el: HTMLDivElement) => void;
  children: JSX.Element;
}

/** 效率型模块根节点：页眉 + 分区同一套页垫，标题左缘对齐。 */
export function YoPage(props: YoPageProps): JSX.Element {
  const host = pageHostAttrs();
  return (
    <div
      ref={(el) => {
        const assign = props.ref;
        if (assign) assign(el);
      }}
      class={`yohu-page${props.class ? ` ${props.class}` : ""}`}
      data-role={host["data-role"]}
    >
      {props.children}
    </div>
  );
}
