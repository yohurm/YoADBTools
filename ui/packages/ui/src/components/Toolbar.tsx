/**
 * YoToolbar —— 页内/对话框命令带（L4 视图）。
 * 模块页眉请用 YoChrome（标题区 + 功能栏），不要把操作挤进窗口标题栏。
 * 命令坐在 band 铬里；溢出走横向滚动。禁止在本控件内再做一套 Overflow ActionMenu。
 */
import type { JSX } from "solid-js";
import { toolbarHostAttrs } from "./toolbar-policy";
import "./Toolbar.css";

export interface YoToolbarProps {
  children: JSX.Element;
}

/**
 * 渲染一个水平排列的命令带壳。
 */
export function YoToolbar(props: YoToolbarProps): JSX.Element {
  const host = toolbarHostAttrs();
  return (
    <div
      class="yohu-toolbar"
      role={host.role}
      data-chrome={host["data-chrome"]}
      data-overflow={host["data-overflow"]}
    >
      {props.children}
    </div>
  );
}
