/** 可用区几何：View 量 `.yohu-mirror__avail`；store 组装 `MirrorLayout`。 */

import { MIRROR_MIN_LAYOUT_PX, type MirrorLayout } from "@yohu/api";

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

/**
 * 可用区相对 WebView 视口（= 主窗客户区）的物理像素。
 * HWND 是 WS_CHILD，禁止再加 `screenX`。
 */
export function clientZoneRect(
  css: CssRect,
  devicePixelRatio: number,
  viewportOffset: ViewportOffset = { left: 0, top: 0 },
): PhysicalRect {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const left = css.left + (Number.isFinite(viewportOffset.left) ? viewportOffset.left : 0);
  const top = css.top + (Number.isFinite(viewportOffset.top) ? viewportOffset.top : 0);
  return {
    x: Math.round(left * dpr),
    y: Math.round(top * dpr),
    width: Math.max(0, Math.round(css.width * dpr)),
    height: Math.max(0, Math.round(css.height * dpr)),
  };
}

export function layoutIsPresentable(width: number, height: number): boolean {
  return width >= MIRROR_MIN_LAYOUT_PX && height >= MIRROR_MIN_LAYOUT_PX;
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

/** HWND chrome / letterbox 跟工作台主题，不是设备夜览。 */
export function workbenchDark(doc: Document): boolean {
  return doc.documentElement.getAttribute("data-theme") === "dark";
}
