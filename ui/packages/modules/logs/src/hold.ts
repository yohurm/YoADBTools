/**
 * 窗口对设备流的引用：hold = capturing || starting。
 * 唯一计数；关窗 / 停采先去掉自己再看 holdCount。
 */

export type HoldFlags = {
  capturing: boolean;
  starting: boolean;
};

export type HoldSession = HoldFlags & {
  id: number;
  serial: string | null;
};

export function sessionHolds(session: HoldFlags): boolean {
  return session.capturing || session.starting;
}

export function holdCount(sessions: readonly HoldSession[], serial: string): number {
  return sessions.filter((session) => session.serial === serial && sessionHolds(session)).length;
}

export function foreignHoldCount(
  sessions: readonly HoldSession[],
  serial: string,
  sessionId: number,
): number {
  return sessions.filter(
    (session) => session.id !== sessionId && session.serial === serial && sessionHolds(session),
  ).length;
}
