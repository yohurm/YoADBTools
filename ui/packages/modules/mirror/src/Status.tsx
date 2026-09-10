/**
 * 投屏实测帧率：进壳状态栏右槽，不盖画面。
 */

import { Show } from "solid-js";
import { YoTooltip } from "@yohu/ui";

import { mirrorStore } from "./store";

export function MirrorStatus() {
  const live = () => mirrorStore.state.phase === "live" && mirrorStore.state.hasFrame;
  return (
    <Show when={live()}>
      <YoTooltip content={`${mirrorStore.state.width}×${mirrorStore.state.height}`}>
        <span>{mirrorStore.state.paintedFps} fps</span>
      </YoTooltip>
    </Show>
  );
}
