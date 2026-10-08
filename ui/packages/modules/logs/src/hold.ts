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

export function sessionHoldsSerial(
  session: { serial: string | null; capturing: boolean; starting: boolean },
  serial: string,
): boolean {
  return session.serial === serial && sessionHolds(session);
}

export function sessionHoldsBound<
  T extends { serial: string | null; capturing: boolean; starting: boolean },
>(session: T): session is T & { serial: string } {
  return Boolean(session.serial) && sessionHolds(session);
}

export function heldBoundSerials(
  sessions: readonly { serial: string | null; capturing: boolean; starting: boolean }[],
): string[] {
  return sessions.filter(sessionHoldsBound).map((session) => session.serial);
}

export function holdCount(sessions: readonly HoldSession[], serial: string): number {
  return sessions.filter((session) => sessionHoldsSerial(session, serial)).length;
}

export function foreignHoldCount(
  sessions: readonly HoldSession[],
  serial: string,
  sessionId: number,
): number {
  return sessions.filter(
    (session) => session.id !== sessionId && sessionHoldsSerial(session, serial),
  ).length;
}
