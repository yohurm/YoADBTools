/**
 * 路径栏提交入口：句法解析 + 安全根。只由 listing.goTo 与测试调用。
 */

import { guardBrowsePath, type PathGuardError } from "./path-guard";
import { parseRemotePath, type PathParseErr, type PathParseOk } from "./path-parse";

export type PathResolveOk = PathParseOk;
export type PathResolveErr = PathParseErr & { error?: PathGuardError };
export type PathResolveResult = PathResolveOk | PathResolveErr;

export function resolveRemotePath(raw: string, current: string): PathResolveResult {
  const parsed = parseRemotePath(raw, current);
  if (!parsed.ok) return parsed;
  const guarded = guardBrowsePath(parsed.path);
  if (!guarded.ok) {
    return { ok: false, reason: guarded.reason, applied: parsed.applied, error: guarded.error };
  }
  return { ok: true, path: guarded.path, applied: parsed.applied };
}
