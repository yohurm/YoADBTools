/**
 * 投屏实测帧率：进壳状态栏右槽，不盖画面。
 */

import { Show } from "solid-js";
import { YoBadge } from "@yohu/ui";

import { mirrorStore } from "./store";
import { mirrorPictureReady } from "./control-ready";

export function MirrorStatus() {
  const live = () => mirrorPictureReady(mirrorStore.state);
  return (
    <Show when={live()}>
      <YoBadge
        text={`${mirrorStore.state.width}×${mirrorStore.state.height} · ${mirrorStore.state.paintedFps} fps`}
        tone="neutral"
      />
    </Show>
  );
}
