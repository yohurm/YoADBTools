/** 可用区几何：View 量 `.yohu-mirror__avail`；store 组装 `MirrorLayout`。 */

import { MIRROR_MIN_LAYOUT_PX, type MirrorLayout } from "@yohu/api";
import { positiveScale } from "@yohu/ui";

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportOffset {
  left: number;
  top: number;
}

/** 没传入视口偏移时，指针和可用区都从零开始。 */
function zeroOffset(): ViewportOffset {
  return { left: 0, top: 0 };
}

/** View 交出的可用区：物理矩形 + 可见/dpr/工作台主题。会话旗标不在这里。 */
export interface AvailZone extends PhysicalRect {
  visible: boolean;
  dpr: number;
  dark: boolean;
}

/** store 会话旗标（不含 avail）。 */
export interface LayoutFlags {
  serial: string;
  fullscreen: boolean;
  paused: boolean;
  control: boolean;
  hasDevice: boolean;
  failed: boolean;
  error: string;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function physicalAxis(css: number, dpr: number): number {
  return Math.round(css * dpr);
}

function cssAxis(css: number, offset: number): number {
  return css + finiteOrZero(offset);
}

/** CSS 客户区点 × 正比例，四舍五入。指针与可用区四边共用。 */
function physicalCssPoint(
  cssX: number,
  cssY: number,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset,
): { x: number; y: number } {
  const dpr = positiveScale(devicePixelRatio);
  const x = cssAxis(cssX, viewportOffset.left);
  const y = cssAxis(cssY, viewportOffset.top);
  return { x: physicalAxis(x, dpr), y: physicalAxis(y, dpr) };
}

/** 指针与 avail 同一套：CSS 客户区坐标 × dpr，不加 screenX。 */
export function clientPointerPx(
  clientX: number,
  clientY: number,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset = zeroOffset(),
): { x: number; y: number } {
  return physicalCssPoint(clientX, clientY, devicePixelRatio, viewportOffset);
}

function zoneSpan(far: number, origin: number): number {
  return Math.max(0, far - origin);
}

/** 远端是起点加上跨度。视口偏移仍走 cssAxis。 */
function cssFar(origin: number, span: number): number {
  return origin + span;
}

/**
 * 可用区相对 WebView 视口（= 主窗客户区）的物理像素。
 * 先取整四边再导出宽高，右边 / 底边守恒。禁止独立 round 宽高。
 * HWND 是 WS_CHILD，禁止再加 `screenX`。
 */
export function clientZoneRect(
  css: CssRect,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset = zeroOffset(),
): PhysicalRect {
  const origin = physicalCssPoint(css.left, css.top, devicePixelRatio, viewportOffset);
  const far = physicalCssPoint(
    cssFar(css.left, css.width),
    cssFar(css.top, css.height),
    devicePixelRatio,
    viewportOffset,
  );
  return {
    x: origin.x,
    y: origin.y,
    width: zoneSpan(far.x, origin.x),
    height: zoneSpan(far.y, origin.y),
  };
}

/** 一条边达到最小物理像素。隐藏必须上报不在这里。 */
function spanPresentable(px: number): boolean {
  return px >= MIRROR_MIN_LAYOUT_PX;
}

export function layoutIsPresentable(width: number, height: number): boolean {
  return spanPresentable(width) && spanPresentable(height);
}

/** 隐藏必须上报；可见时低于最小物理像素不 Present。 */
export function shouldReportLayout(avail: AvailZone): boolean {
  return !avail.visible || layoutIsPresentable(avail.width, avail.height);
}

export function assembleMirrorLayout(avail: AvailZone, flags: LayoutFlags): MirrorLayout {
  return {
    serial: flags.serial,
    x: avail.x,
    y: avail.y,
    width: avail.width,
    height: avail.height,
    visible: avail.visible,
    dpr: avail.dpr,
    fullscreen: flags.fullscreen,
    paused: flags.paused,
    control: flags.control,
    has_device: flags.hasDevice,
    failed: flags.failed,
    error: flags.error,
    dark: avail.dark,
  };
}

export function layoutInsetKey(layout: MirrorLayout): string {
  return `${layout.serial},${layout.x},${layout.y},${layout.width}x${layout.height},v=${layout.visible},dpr=${layout.dpr},f=${layout.fullscreen},p=${layout.paused},c=${layout.control},dev=${layout.has_device},fail=${layout.failed},e=${layout.error},dark=${layout.dark}`;
}
