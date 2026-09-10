/**
 * 路径栏提交入口：句法解析 + 安全根。View / store 只调这里。
 */

import { guardBrowsePath } from "./path-guard";
import { parseRemotePath, type PathParseResult } from "./path-parse";

export type PathResolveResult = PathParseResult;

export function resolveRemotePath(raw: string, current: string): PathResolveResult {
  const parsed = parseRemotePath(raw, current);
  if (!parsed.ok) return parsed;
  const guarded = guardBrowsePath(parsed.path);
  if (!guarded.ok) return { ok: false, reason: guarded.reason, applied: parsed.applied };
  return { ok: true, path: guarded.path, applied: parsed.applied };
}
