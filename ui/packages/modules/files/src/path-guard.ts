/**
 * 浏览路径安全根（ADR-v6-013 的 UI 镜像）。与 domain SafetyRoot::check 同一向量。
 * core 仍强制校验，不信任本层。
 */

import { SAFETY_ROOTS } from "@yohu/api";

export type PathGuardError = "outside_root" | "not_absolute" | "traversal";

const GUARD_REASON: Record<PathGuardError, string> = {
  outside_root: "路径不在安全根内",
  not_absolute: "路径必须是绝对路径",
  traversal: "路径含 .. 穿越",
};

/** 与 domain RemotePath::parse 同一套：反斜杠转斜杠、折叠 `.` 与空段、拒绝 `..`、必须绝对路径。 */
export function parseSafetyPath(
  raw: string,
): { ok: true; path: string } | { ok: false; error: Exclude<PathGuardError, "outside_root"> } {
  const replaced = raw.replace(/\\/g, "/");
  if (!replaced.startsWith("/")) {
    return { ok: false, error: "not_absolute" };
  }
  const parts: string[] = [];
  for (const seg of replaced.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") return { ok: false, error: "traversal" };
    parts.push(seg);
  }
  return { ok: true, path: `/${parts.join("/")}` };
}

export function isWithinSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

export function guardBrowsePath(
  path: string,
  roots: readonly string[] = SAFETY_ROOTS,
): { ok: true; path: string } | { ok: false; reason: string; error: PathGuardError } {
  const parsed = parseSafetyPath(path);
  if (!parsed.ok) {
    return { ok: false, reason: GUARD_REASON[parsed.error], error: parsed.error };
  }
  if (!isWithinSafety(parsed.path, roots)) {
    return { ok: false, reason: GUARD_REASON.outside_root, error: "outside_root" };
  }
  return { ok: true, path: parsed.path };
}
