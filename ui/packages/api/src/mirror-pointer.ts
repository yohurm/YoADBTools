/** 舞台指针种类。抓住和放开都认这一份，视图不再比 kind。 */

import type { MirrorPointerKind } from "./types";

/** 按下才 setPointerCapture。move 不抓。 */
export function mirrorPointerCaptures(kind: MirrorPointerKind): boolean {
  return kind === "down";
}

/** 抬起或离开才 releasePointerCapture。 */
export function mirrorPointerReleases(kind: MirrorPointerKind): boolean {
  return kind === "up" || kind === "leave";
}
