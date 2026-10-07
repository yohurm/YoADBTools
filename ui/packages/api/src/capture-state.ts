/** 设备 logcat 槽位。窗口里的 capturing 布尔是投影，不是这一份。 */

import type { CaptureState } from "./types";

export function captureStateIsRunning(state: CaptureState): boolean {
  return state === "running";
}
