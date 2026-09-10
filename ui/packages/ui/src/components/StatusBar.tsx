/**
 * YoStatusBar —— 窗口底部状态栏（L4 视图）。
 * 角色由 statusbar-model + statusbar-policy 决定；本文件只绑属性与左右只读槽。
 * 不要塞命令带。
 */
import type { JSX } from "solid-js";
import { statusbarHostAttrs } from "./statusbar-policy";
import "./StatusBar.css";

export interface YoStatusBarProps {
  /** 左侧插槽 */
  left?: JSX.Element;
  /** 右侧插槽 */
  right?: JSX.Element;
}

/** 渲染一个左右布局的底部状态栏。 */
export function YoStatusBar(props: YoStatusBarProps): JSX.Element {
  const host = statusbarHostAttrs();
  return (
    <footer class="yohu-status-bar" data-role={host["data-role"]}>
      <div class="yohu-status-bar__left">{props.left}</div>
      <div class="yohu-status-bar__right">{props.right}</div>
    </footer>
  );
}
