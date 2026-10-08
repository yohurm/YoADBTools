/**
 * 投屏分辨率：进壳状态栏右槽，不盖画面。
 * Live 且有尺寸就显示；fps 大于 0 才接上。
 */

import { For, Show } from "solid-js";
import { YoBadge } from "@yohu/ui";

import { mirrorLiveBadge } from "./control-ready";
import { mirrorStore } from "./store";

export function MirrorStatus() {
  return (
    <For each={mirrorStore.state.sessions}>
      {(row) => (
        <Show when={mirrorLiveBadge(row)}>
          {(text) => <YoBadge text={text()} tone="neutral" />}
        </Show>
      )}
    </For>
  );
}
