/**
 * YoBadge（L4 视图）。
 * 语义色由 badge-model + badge-policy 决定；本文件只绑属性与内容区。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import type { YoBadgeTone } from "./badge-model";
import { badgeHostAttrs } from "./badge-policy";
import "./Badge.css";

export type { YoBadgeTone };

export interface YoBadgeProps {
  /** 徽章文本 */
  text: string;
  /** 语义色。与 Button 同一枚举。默认 neutral */
  tone?: YoBadgeTone;
}

/** 渲染一个胶囊徽章。内容区 = 文案，圆角内裁剪。 */
export function YoBadge(props: YoBadgeProps): JSX.Element {
  const host = createMemo(() => badgeHostAttrs(props));
  return (
    <span class="yohu-badge" data-tone={host()["data-tone"]} aria-label={host()["aria-label"]}>
      {props.text}
    </span>
  );
}
