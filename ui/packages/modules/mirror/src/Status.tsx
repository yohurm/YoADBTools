/**
 * 投屏实测帧率：进壳状态栏右槽，不盖画面。
 */

import { Show } from "solid-js";
import { YoBadge } from "@yohu/ui";

import { mirrorStore } from "./store";

export function MirrorStatus() {
  const live = () => mirrorStore.state.phase === "live" && mirrorStore.state.hasFrame;
  return (
    <Show when={live()}>
      <YoBadge
        text={`${mirrorStore.state.width}×${mirrorStore.state.height} · ${mirrorStore.state.paintedFps} fps`}
        tone="neutral"
      />
    </Show>
  );
}
