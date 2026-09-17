/**
 * YoBadge（L4 视图）。
 * 语义色由 badge-model + badge-policy 决定；本文件只绑属性与内容区。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { CornerPillRadius, YoCorner } from "../corner";
import type { YoBadgeTone } from "./badge-model";
import { badgeHostAttrs } from "./badge-policy";
import "./Badge.css";

export type { YoBadgeTone };

export interface YoBadgeProps {
  /** 徽章文本 */
  text: string;
  /** 语义色。自持五色，不跟 YoButton role 绑死。默认 neutral */
  tone?: YoBadgeTone;
}

/** 渲染一个胶囊徽章。内容区 = 文案，圆角内裁剪。 */
export function YoBadge(props: YoBadgeProps): JSX.Element {
  const host = createMemo(() => badgeHostAttrs(props));
  return (
    <span class="yohu-badge" data-tone={host()["data-tone"]} aria-label={host()["aria-label"]}>
      <YoCorner
        role="control"
        radius={CornerPillRadius}
        class="yohu-badge__chrome"
        direction="row"
        align="center"
        overflow="hidden"
        pad="inline-sm"
      >
        {props.text}
      </YoCorner>
    </span>
  );
}
