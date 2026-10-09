/** 投屏画面是否可操作。会话词在 @yohu/api。 */

import { boundSerial, mirrorIsFailed, mirrorIsLive, mirrorIsStarting } from "@yohu/api";

/** 会话阶段已在播。可寻址和已出画都问这一下。正在启动不并。 */
function phaseIsLive(state: { phase: string }): boolean {
  return mirrorIsLive(state.phase);
}

/** 呈现绑定失败。没有表面时暂停、全屏和指针都不该亮。 */
export function mirrorPresentFailed(bind: string): boolean {
  return bind === "failed";
}

/** 有序列号且会话已在播。控制消息送到这台设备。不要求已经出画。 */
export function mirrorSessionAddressable(state: {
  serial: string | null;
  phase: string;
}): string | null {
  if (!state.serial || !phaseIsLive(state)) return null;
  return state.serial;
}

/** 失败绑定时不再发指针。截图和设备键仍另等已出画。 */
export function mirrorPointerTarget(state: {
  serial: string | null;
  phase: string;
  presentBind: string;
}): string | null {
  if (mirrorPresentFailed(state.presentBind)) return null;
  return mirrorSessionAddressable(state);
}

/** 暂停和全屏：会话在播，且呈现绑定没有失败。未绑定的平台保持可点。 */
export function mirrorPlaybackReady(state: { phase: string; presentBind: string }): boolean {
  return phaseIsLive(state) && !mirrorPresentFailed(state.presentBind);
}

/** 洞内文案。只在呈现失败且会话仍在播，或会话失败时出现。空标题不画。 */
export function mirrorHoleCopy(state: {
  phase: string;
  presentBind: string;
  presentTitle: string;
  presentBody: string;
  sessionHoleTitle: string;
  sessionHoleBody: string;
}): { title: string; body: string } | null {
  if (mirrorIsFailed(state.phase) && state.sessionHoleTitle) {
    return { title: state.sessionHoleTitle, body: state.sessionHoleBody };
  }
  if (phaseIsLive(state) && mirrorPresentFailed(state.presentBind) && state.presentTitle) {
    return { title: state.presentTitle, body: state.presentBody };
  }
  return null;
}

/** 已经画出一帧。截图认这一下。状态栏不拿它当整行开关。 */
export function mirrorPictureReady(state: { phase: string; hasFrame: boolean }): boolean {
  return phaseIsLive(state) && state.hasFrame;
}

/** Live 且有尺寸就给出分辨率；fps 大于 0 才接上。否则没有徽章。 */
export function mirrorLiveBadge(row: {
  phase: string;
  width: number;
  height: number;
  painted_fps: number;
}): string | null {
  if (!phaseIsLive(row) || row.width <= 0 || row.height <= 0) return null;
  if (row.painted_fps > 0) return `${row.width}×${row.height} · ${row.painted_fps} fps`;
  return `${row.width}×${row.height}`;
}

/** 开始和仅显示：已选定一台设备，且不在启动中。质量栏只认启动中，不走这里。 */
export function mirrorSetupEnabled(serials: readonly string[], phase: string): boolean {
  return boundSerial(serials) !== null && !mirrorIsStarting(phase);
}

/** 画面上可以操作：已出画、非只读、控制通道开着。布局旗标和页头共用。 */
export function mirrorControlReady(state: {
  phase: string;
  hasFrame: boolean;
  readOnly: boolean;
  control: boolean;
}): boolean {
  return mirrorPictureReady(state) && !state.readOnly && state.control;
}
