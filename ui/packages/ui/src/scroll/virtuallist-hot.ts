/**
 * 选中行 fill 指针热态（L3 binder）。
 * 持有 hover/pressed；L4 只绑 data-indicator-hot 与指针。填色在 indicator.css。
 * 禁止 :has list-row。不画铬。
 */

import { createSignal, type Accessor } from "solid-js";
import { resolveVirtualIndicatorHot, type VirtualIndicatorHot } from "./virtuallist-policy";

const ROW = ".yohu-virtual-list__row";

export interface VirtualIndicatorHotBinder {
  hot: Accessor<VirtualIndicatorHot | undefined>;
  onPointerOver: (event: PointerEvent) => void;
  onPointerOut: (event: PointerEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
}

function isSelectedFillRow(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(ROW)?.getAttribute("aria-selected") === "true";
}

export function createVirtualIndicatorHotBinder(host: {
  follow: () => boolean;
  reordering: () => boolean;
}): VirtualIndicatorHotBinder {
  const [hot, setHot] = createSignal<VirtualIndicatorHot | undefined>();
  let pressed = false;

  const fill = (): boolean => host.follow() && !host.reordering();

  const sync = (event: Event): void => {
    setHot(
      resolveVirtualIndicatorHot({
        fill: fill(),
        onSelectedFill: isSelectedFillRow(event.target),
        pressed,
      }),
    );
  };

  return {
    hot,
    onPointerOver: sync,
    onPointerOut: (event) => {
      const row = event.target instanceof Element ? event.target.closest(ROW) : null;
      const next = event.relatedTarget;
      if (row instanceof Node && next instanceof Node && row.contains(next)) return;
      if (pressed) return;
      setHot(undefined);
    },
    onPointerDown: (event) => {
      pressed = isSelectedFillRow(event.target);
      sync(event);
    },
    onPointerUp: (event) => {
      pressed = false;
      sync(event);
    },
  };
}
