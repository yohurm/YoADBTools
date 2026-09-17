/**
 * YoToolbar —— 页内/对话框命令带（L4 视图）。
 * 模块页眉请用 YoChrome（标题区 + 功能栏），不要把操作挤进窗口标题栏。
 * 命令坐在 band 铬里；横向只裁切，不画系统条。禁止在本控件内再做一套 Overflow ActionMenu。
 */
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { Radius } from "../tokens/radius";
import type { ToolbarPad } from "./toolbar-model";
import { toolbarHostAttrs } from "./toolbar-policy";
import "./Toolbar.css";

export type YoToolbarPad = ToolbarPad;

export interface YoToolbarProps {
  /** 命令带内容。标题请调用方组合 YoSubheader，禁止本容器 import 产品 Yo*。 */
  children: JSX.Element;
  /** 命令带垫。band = 独立灰带 + 底距 / 行内 xs；xs = 贴栏素底（块 xs / 行内 md，与卡片清单文本对齐）。 */
  pad?: YoToolbarPad;
}

/**
 * 渲染一个水平排列的命令带壳。
 */
export function YoToolbar(props: YoToolbarProps): JSX.Element {
  const host = () => toolbarHostAttrs({ pad: props.pad });
  const chrome = () => host()["data-chrome"];
  return (
    <div
      class="yohu-toolbar"
      role={host().role}
      data-chrome={chrome()}
      data-overflow={host()["data-overflow"]}
      data-pad={host()["data-pad"]}
    >
      <YoCorner
        role="control"
        radius={chrome() === "plain" ? Radius.None : undefined}
        class="yohu-toolbar__chrome"
        direction="row"
        align="center"
        overflow="hidden"
        gap="sm"
      >
        {props.children}
      </YoCorner>
    </div>
  );
}
