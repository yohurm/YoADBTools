/**
 * 窗口采集相：Tab 圆点、状态行、空态、页眉按钮共用，只认本窗口订阅（capturing / starting）。
 * 崩溃 / ANR 是可见面板上的派生值，不得改采集相颜色。
 */

import type { YoButtonTone, YoStatusDotTone, YoTabDotTone } from "@yohu/ui";

export type SessionCapturePhase = "live" | "starting" | "stopped";

export function sessionCapturePhase(session: {
  capturing: boolean;
  starting: boolean;
}): SessionCapturePhase {
  if (session.capturing) return "live";
  if (session.starting) return "starting";
  return "stopped";
}

/** 窗口正在收行。启动中不算。扇出、补洞和页眉暂停都认这一把。 */
export function sessionCaptureIsLive(session: {
  capturing: boolean;
  starting: boolean;
}): boolean {
  return sessionPhaseIsLive(sessionCapturePhase(session));
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

/** 页眉按钮：启动中可取消，采集中停止，停着则开始。 */
export function sessionCaptureButton(phase: SessionCapturePhase): string {
  switch (phase) {
    case "starting":
      return "取消启动";
    case "live":
      return "停止";
    case "stopped":
      return "开始";
  }
}

/** 正在采集。Tab 圆点和状态行都认这一把。 */
export function sessionPhaseIsLive(phase: SessionCapturePhase): boolean {
  return phase === "live";
}

/** 占着采集（启动中或已在采）。按钮色取它的危险面。 */
export function sessionCaptureOccupies(phase: SessionCapturePhase): boolean {
  return phase !== "stopped";
}

/** 占着采集用危险色；停着用强调色。 */
export function sessionCaptureButtonTone(phase: SessionCapturePhase): YoButtonTone {
  return sessionCaptureOccupies(phase) ? "danger" : "accent";
}

export function sessionTabDot(phase: SessionCapturePhase): { tone: YoTabDotTone } | undefined {
  if (sessionPhaseIsLive(phase)) return { tone: "success" };
  if (phase === "starting") return { tone: "accent" };
  return undefined;
}

export function sessionEmptyWait(phase: SessionCapturePhase): { title: string; description: string } | null {
  const view = sessionEmptyView(phase, false);
  if (!sessionEmptyIsWait(view)) return null;
  return { title: view.title, description: view.description };
}

export type SessionEmptyView = {
  kind: "idle" | "filtered" | "wait";
  title: string;
  description: string;
  action?: string;
};

/** 空态在等待采集。加载块和等待文案都认这一把。 */
export function sessionEmptyIsWait(view: SessionEmptyView): boolean {
  return view.kind === "wait";
}

const EMPTY_IDLE: SessionEmptyView = {
  kind: "idle",
  title: "未采集",
  description: "点击「开始采集」拉取设备日志",
  action: "开始采集",
};

const EMPTY_FILTERED: SessionEmptyView = {
  kind: "filtered",
  title: "无匹配日志",
  description: "调整过滤条件（级别/Tag/关键字）后重试",
};

const EMPTY_STARTING: SessionEmptyView = {
  kind: "wait",
  title: "正在启动采集…",
  description: "正在连接设备 logcat",
};

const EMPTY_LIVE: SessionEmptyView = {
  kind: "wait",
  title: "等待设备输出…",
  description: "logcat 采集中，暂未收到行",
};

/** 可见区为空时画哪一块。过滤开着且不是启动中，优先无匹配。 */
export function sessionEmptyView(phase: SessionCapturePhase, filterActive: boolean): SessionEmptyView {
  switch (phase) {
    case "stopped":
      return filterActive ? EMPTY_FILTERED : EMPTY_IDLE;
    case "starting":
      return EMPTY_STARTING;
    case "live":
      return filterActive ? EMPTY_FILTERED : EMPTY_LIVE;
  }
}

/** 状态行圆点：只有正在采集是成功色，启动中和已停止都是离线色。 */
export function sessionStatusTone(phase: SessionCapturePhase): YoStatusDotTone {
  return sessionPhaseIsLive(phase) ? "success" : "offline";
}
