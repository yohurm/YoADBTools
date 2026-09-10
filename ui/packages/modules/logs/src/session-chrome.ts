/**
 * 窗口采集相：Tab 圆点、状态行、空态共用，只认本窗口订阅（capturing / starting）。
 * 崩溃 / ANR 是可见面板上的派生值，不得改采集相颜色。
 */

export type SessionCapturePhase = "live" | "starting" | "stopped";

export function sessionCapturePhase(session: {
  capturing: boolean;
  starting: boolean;
}): SessionCapturePhase {
  if (session.capturing) return "live";
  if (session.starting) return "starting";
  return "stopped";
}

export function sessionIsLive(session: { capturing: boolean; starting: boolean }): boolean {
  return sessionCapturePhase(session) !== "stopped";
}

export function sessionCaptureLabel(phase: SessionCapturePhase): string {
  switch (phase) {
    case "live":
      return "采集中";
    case "starting":
      return "启动中";
    case "stopped":
      return "已停止";
  }
}

export function sessionTabDot(phase: SessionCapturePhase): { tone: "success" | "accent" } | undefined {
  if (phase === "live") return { tone: "success" };
  if (phase === "starting") return { tone: "accent" };
  return undefined;
}

export function sessionEmptyWait(phase: SessionCapturePhase): { title: string; description: string } | null {
  if (phase === "stopped") return null;
  if (phase === "starting") {
    return { title: "正在启动采集…", description: "正在连接设备 logcat" };
  }
  return { title: "等待设备输出…", description: "logcat 采集中，暂未收到行" };
}
