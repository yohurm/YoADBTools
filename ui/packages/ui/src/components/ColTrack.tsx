/**
 * YoColTrack —— 清单体一行。
 * 轨道只吃父级 YoColFrame 的 `--yohu-col-tracks`，禁止再写 grid-template-columns。
 */
import { splitProps, type JSX } from "solid-js";
import "./ColTrack.css";

export type YoColTrackProps = JSX.HTMLAttributes<HTMLDivElement>;

export function YoColTrack(props: YoColTrackProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "classList"]);
  return (
    <div
      {...rest}
      class={`yohu-col-track${local.class ? ` ${local.class}` : ""}`}
      classList={local.classList}
      role="row"
    />
  );
}
