/**
 * 新建日志窗口的划分。只有包名和 PID。
 * 已打开窗口的 SessionScope 仍由 scopeIsPackage 判断，不进这里。
 */

import { trimmedTextPresent } from "@yohu/ui";

const NEW_SESSION_MODES = ["package", "pid"] as const;

export type NewSessionMode = (typeof NEW_SESSION_MODES)[number];

export function newSessionModeOf(value: string): NewSessionMode | null {
  for (const mode of NEW_SESSION_MODES) {
    if (mode === value) return mode;
  }
  return null;
}

/** 包名划分。PID 是它的另一面。 */
export function newSessionIsPackage(mode: NewSessionMode): boolean {
  return mode === "package";
}

/** 包名提交值。空白不是包名。能否创建和真正提交都认这一把。 */
export function newSessionPackageName(query: string): string | null {
  const name = query.trim();
  if (!trimmedTextPresent(name)) return null;
  return name;
}

/** PID 提交值。非正整数不是 PID。能否创建和真正提交都认这一把。 */
export function newSessionPid(query: string): number | null {
  const pid = Number.parseInt(query.trim(), 10);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return pid;
}
