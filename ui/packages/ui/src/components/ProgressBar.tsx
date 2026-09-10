/**
 * YoProgressBar（L4 视图）。
 * 夹取 / 模式由 progress-model + progress-policy 决定；本文件只绑属性与填充。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { progressFillWidth, progressHostAttrs } from "./progress-policy";
import "./ProgressBar.css";

export interface YoProgressBarProps {
  /** 进度值 0-100 */
  value?: number;
  /** 不定态 */
  indeterminate?: boolean;
}

/** 渲染一个确定态或不定态进度条。内容区 = 轨道内填充。 */
export function YoProgressBar(props: YoProgressBarProps): JSX.Element {
  const host = createMemo(() => progressHostAttrs(props));
  const width = createMemo(() => progressFillWidth(props));
  return (
    <div
      class="yohu-progress"
      data-mode={host()["data-mode"]}
      role={host().role}
      aria-valuemin={host()["aria-valuemin"]}
      aria-valuemax={host()["aria-valuemax"]}
      aria-valuenow={host()["aria-valuenow"]}
    >
      <div class="yohu-progress__bar" style={width() ? { width: width() } : undefined} />
    </div>
  );
}
