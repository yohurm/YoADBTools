/**
 * 清单投放框策略（L3）。
 * 组装叠加层 data-* 与内容坐标 style。不写色值、不碰 JSX。
 */

import type { ListFrameBox, YoListFrameVariant } from "./list-frame-model";

export interface ListFrameHostAttrs {
  "data-variant": YoListFrameVariant;
}

export function listFrameHostAttrs(variant: YoListFrameVariant = "hot"): ListFrameHostAttrs {
  return { "data-variant": variant };
}

export function listFrameStyle(box: ListFrameBox): {
  position: "absolute";
  top: string;
  left: string;
  width: string;
  height: string;
} {
  return {
    position: "absolute",
    top: `${box.y}px`,
    left: `${box.x}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}
