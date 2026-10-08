/**
 * 命令库栏投放：只判断指针是否落在栏矩形内。
 * 虚线铬走 YoPanel edge=drop。不引用文件模块的目录落点。
 */

import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

import { bindNativeDragDrop, dragEventIsDrop, dragEventIsHover, dragPathsAreEmpty, NATIVE_DRAG_SUBSCRIBE_FAILED, YoLog, type NativeDragDropEvent } from "@yohu/api";
import {
  cssPointFromPhysical,
  hostPixelRatio,
  pointInRect,
  rectOf,
  type PointerRect,
} from "@yohu/ui";

/** 物理点落在栏矩形内。悬停热态和松手提交都认这一把。 */
function pointerInPane(position: { x: number; y: number }, rect: PointerRect, scale: number): boolean {
  const point = cssPointFromPhysical(position.x, position.y, scale);
  return pointInRect(rect, point.x, point.y);
}

function eventIsDrop(event: NativeDragDropEvent): boolean {
  return dragEventIsDrop(event);
}

function paneMissing(rect: PointerRect | undefined): boolean {
  return !rect;
}

/** enter/over 且点在栏内才是热态。leave / drop 不是热态。 */
export function dragHitsPane(
  event: NativeDragDropEvent,
  rect: PointerRect | undefined,
  scale: number,
): boolean {
  if (!dragEventIsHover(event) || paneMissing(rect)) return false;
  return pointerInPane(event.position, rect, scale);
}

/** 松手只在栏内交出路径。栏外或空路径不提交。 */
export function droppedPaths(
  event: NativeDragDropEvent,
  rect: PointerRect | undefined,
  scale: number,
): string[] | undefined {
  if (!eventIsDrop(event) || paneMissing(rect)) return undefined;
  if (dragPathsAreEmpty(event.paths)) return undefined;
  if (!pointerInPane(event.position, rect, scale)) return undefined;
  return event.paths;
}

export function createLibraryDrop(host: {
  paneEl: () => Element | undefined;
  onDrop: (paths: string[]) => void;
}): { hot: Accessor<boolean> } {
  const [hot, setHot] = createSignal(false);

  function clearHot(): void {
    setHot(false);
  }

  onMount(() => {
    const stopDrag = bindNativeDragDrop(
      (event) => {
        const el = host.paneEl();
        const rect = el ? rectOf(el) : undefined;
        const scale = hostPixelRatio();
        if (eventIsDrop(event)) {
          clearHot();
          const paths = droppedPaths(event, rect, scale);
          if (paths) host.onDrop(paths);
          return;
        }
        setHot(dragHitsPane(event, rect, scale));
      },
      (error) => {
        YoLog.error("terminal", NATIVE_DRAG_SUBSCRIBE_FAILED, error);
        clearHot();
      },
    );

    onCleanup(() => {
      clearHot();
      stopDrag();
    });
  });

  return { hot };
}
