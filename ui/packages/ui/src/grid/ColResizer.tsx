/**
 * YoColResizer —— 表头列宽边界。
 * 对照：Spectrum separator + valuemin/now/max；AG Grid start/move/end；VS Code sash capture。
 * 受控：width / minWidth / onWidthChange(width, phase)。YoUI 不算单元格自适应。
 * 热区透明；可见铬是 AG Grid 式居中短柄（::before）。
 */
import { createSignal, onCleanup, type JSX } from "solid-js";

import { nudgeColWidth, type ColResizePhase, type YoColSpec } from "./col-model";
import { beginColResize, moveColResize, type ColResizeSession } from "./col-resize";
import "./ColResizer.css";

export interface YoColResizerProps {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /** 无障碍名称 */
  label?: string;
  onWidthChange?: (width: number, phase: ColResizePhase) => void;
  /** 双击；调用方决定是否按内容回默认宽 */
  onFit?: () => void;
  /** 只画列缝短柄，不拖、不进 Tab */
  mark?: boolean;
}

const RESIZE_LOCK = "yohuColResizing";

function lockPageResize(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.dataset[RESIZE_LOCK] = "";
  else delete document.documentElement.dataset[RESIZE_LOCK];
}

/**
 * 渲染列右缘可聚焦拖条。
 */
export function YoColResizer(props: YoColResizerProps): JSX.Element {
  const [active, setActive] = createSignal(false);
  let session: ColResizeSession | null = null;

  const spec = (): YoColSpec => ({
    key: "col",
    defaultWidth: props.width ?? 0,
    minWidth: props.minWidth ?? 0,
    maxWidth: props.maxWidth,
  });

  const finish = (clientX: number | null): void => {
    if (!session) return;
    const width = clientX === null ? (props.width ?? 0) : moveColResize(session, clientX, spec());
    session = null;
    setActive(false);
    lockPageResize(false);
    props.onWidthChange?.(width, "end");
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    session = beginColResize("col", event.clientX, props.width ?? 0);
    setActive(true);
    lockPageResize(true);
    props.onWidthChange?.(props.width ?? 0, "start");
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      /* jsdom / 指针未激活时 capture 会抛，会话仍跟元素上的 move/up */
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!session) return;
    const width = moveColResize(session, event.clientX, spec());
    if (width === (props.width ?? 0)) return;
    props.onWidthChange?.(width, "move");
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!session) return;
    const target = event.currentTarget as HTMLElement;
    try {
      target.releasePointerCapture?.(event.pointerId);
    } catch {
      /* 与 setPointerCapture 对称：无捕获时忽略 */
    }
    finish(event.clientX);
  };

  const onLostCapture = (): void => {
    finish(null);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const current = spec();
    let next: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        next = nudgeColWidth(props.width ?? 0, current, -1);
        break;
      case "ArrowRight":
        next = nudgeColWidth(props.width ?? 0, current, 1);
        break;
      case "Home":
        next = current.minWidth;
        break;
      case "End":
        if (current.maxWidth === undefined) return;
        next = current.maxWidth;
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next === (props.width ?? 0)) return;
    props.onWidthChange?.(next, "end");
  };

  onCleanup(() => {
    if (session) lockPageResize(false);
  });

  if (props.mark) {
    return <div class="yohu-col-resizer" data-mark="" aria-hidden="true" />;
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label ?? "调节列宽"}
      aria-valuemin={props.minWidth ?? 0}
      aria-valuenow={Math.round(props.width ?? 0)}
      aria-valuemax={props.maxWidth ?? undefined}
      tabindex="0"
      class="yohu-col-resizer"
      data-active={active() ? "" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onLostCapture}
      onKeyDown={onKeyDown}
      onDblClick={() => props.onFit?.()}
    />
  );
}
