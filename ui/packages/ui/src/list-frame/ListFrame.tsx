/**
 * YoListFrame —— 清单投放/焦点框（L4）。
 * 叠加在虚拟列表 inner 上，不进行盒。描边走 YoCorner 直角环。
 */
import { Show, type Accessor, type JSX } from "solid-js";

import { YoCorner } from "../corner";
import { Radius } from "../tokens/radius";
import type { ListFrameBox, YoListFrameVariant } from "./list-frame-model";
import { listFrameHostAttrs, listFrameStyle } from "./list-frame-policy";
import "./ListFrame.css";

export type { ListFrameBox, YoListFrameVariant };

export interface YoListFrameProps {
  box: Accessor<ListFrameBox | null>;
  variant?: YoListFrameVariant;
}

export function YoListFrame(props: YoListFrameProps): JSX.Element {
  const attrs = () => listFrameHostAttrs(props.variant ?? "hot");
  const box = (): ListFrameBox | null => props.box();
  return (
    <Show when={box() != null}>
      <div
        class="yohu-list-frame"
        data-variant={attrs()["data-variant"]}
        style={listFrameStyle(box() as ListFrameBox)}
        aria-hidden="true"
      >
        <YoCorner mode="paint" role="control" radius={Radius.None} stroke clip={false} />
      </div>
    </Show>
  );
}
