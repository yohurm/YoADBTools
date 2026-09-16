/**
 * YoCorner —— 算法圆角铬（L4）。
 * 填充与描边共用 L2 圆弧路径；内容用同一 inset 路径裁，避免毛边。
 * host = 自持盒；paint = 铺在已有宿主上（按钮等）。
 * 色走 `--yohu-corner-fill` / `--yohu-corner-stroke`，禁止本文件写语义色。
 */
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { resolveCornerPaint, type CornerRadii, type CornerRole } from "./corner-model";
import { resolveCornerHostSpec, type YoCornerMode } from "./corner-policy";
import "./Corner.css";

export type { CornerRadii, CornerRole, YoCornerMode };

export interface YoCornerProps {
  role?: CornerRole;
  radius?: number;
  radii?: Partial<CornerRadii>;
  stroke?: boolean;
  clip?: boolean;
  mode?: YoCornerMode;
  class?: string;
  children?: JSX.Element;
}

export function YoCorner(props: YoCornerProps): JSX.Element {
  const spec = createMemo(() =>
    resolveCornerHostSpec({
      role: props.role,
      radius: props.radius,
      stroke: props.stroke,
      clip: props.clip,
      mode: props.mode,
    }),
  );

  const [box, setBox] = createSignal({ width: 0, height: 0 });
  const [root, setRoot] = createSignal<HTMLDivElement>();

  const measure = (el: HTMLElement): void => {
    const rect = el.getBoundingClientRect();
    setBox((prev) =>
      prev.width === rect.width && prev.height === rect.height
        ? prev
        : { width: rect.width, height: rect.height },
    );
  };

  const bind = (el: HTMLDivElement): void => {
    setRoot(el);
    const target = spec().mode === "paint" ? el.parentElement : el;
    if (target) measure(target);
  };

  createEffect(() => {
    const el = root();
    const mode = spec().mode;
    if (!el) return;
    const target = mode === "paint" ? el.parentElement : el;
    if (!target) return;
    measure(target);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure(target));
    observer.observe(target);
    onCleanup(() => observer.disconnect());
  });

  const paint = createMemo(() => {
    const host = spec();
    const size = box();
    return resolveCornerPaint({
      width: size.width,
      height: size.height,
      role: host.role,
      radius: host.radius,
      radii: props.radii,
      stroke: host.stroke,
    });
  });

  return (
    <div
      ref={bind}
      class={`yohu-corner${props.class ? ` ${props.class}` : ""}`}
      data-mode={spec().mode}
      data-role={spec().role}
      aria-hidden={spec().mode === "paint" ? true : undefined}
    >
      <svg class="yohu-corner__paint" viewBox={paint().viewBox} aria-hidden="true" focusable="false">
        <Show when={paint().fillPath.length > 0}>
          <path class="yohu-corner__fill" d={paint().fillPath} />
        </Show>
        <Show when={paint().strokePath.length > 0}>
          <path class="yohu-corner__stroke" d={paint().strokePath} fill-rule="evenodd" />
        </Show>
      </svg>
      <Show when={spec().mode === "host"}>
        <div
          class="yohu-corner__content"
          style={
            spec().clip && paint().clipPath !== "none"
              ? { "clip-path": paint().clipPath }
              : undefined
          }
        >
          {props.children}
        </div>
      </Show>
    </div>
  );
}
