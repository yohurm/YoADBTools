/**
 * YoReveal —— 内容槽。
 * 公开 API：open + children。
 * 绘制轴始终绝对定位；布局轴只改占位高。自己不插高度过渡、不裁切、不插 0fr/1fr。
 * 祖先有 YoTravel 时，开合/子树变化当拍 command()；没有只改占位，不报错。
 * Solid 文档：createRenderEffect 首跑 refs 未赋值。布局轴只在 effect 里写，禁止 JSX 先改 data-layout。
 */
import { createRenderEffect } from "solid-js";
import type { JSX } from "solid-js";
import { revealHostAttrs } from "./reveal-policy";
import { useTravel } from "./travel";

export interface YoRevealProps {
  open: boolean;
  children: JSX.Element;
}

export function YoReveal(props: YoRevealProps): JSX.Element {
  const travel = useTravel();
  let root: HTMLDivElement | undefined;
  let content: HTMLDivElement | undefined;

  const paintLayout = (open: boolean): void => {
    if (!root) return;
    const attrs = revealHostAttrs(open);
    root.setAttribute("data-open", attrs["data-open"]);
    root.setAttribute("data-layout", attrs["data-layout"]);
    if (content) {
      const span = content.scrollHeight;
      if (span > 0) root.style.setProperty("--yohu-reveal-span", `${span}px`);
    }
  };

  createRenderEffect(() => {
    const open = props.open;
    props.children;
    if (!root) return;
    travel?.snapshot();
    paintLayout(open);
    root.offsetHeight;
    travel?.command();
  });

  return (
    <div
      class="yohu-reveal"
      ref={(el) => {
        root = el;
        paintLayout(props.open);
      }}
    >
      <div
        class="yohu-reveal__content"
        ref={(el) => {
          content = el;
        }}
        aria-hidden={!props.open || undefined}
        inert={!props.open ? true : undefined}
      >
        {props.children}
      </div>
    </div>
  );
}
