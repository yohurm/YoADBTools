/**
 * 设备路径安全与路径代数。与 yohu-domain::safety 同一套 testdata。
 * core 仍强制校验，不信任本层。
 */

import { SAFETY_ROOTS } from "./identity";

export type PathGuardError = "outside_root" | "not_absolute" | "traversal";

const GUARD_REASON: Record<PathGuardError, string> = {
  outside_root: "路径不在安全根内",
  not_absolute: "路径必须是绝对路径",
  traversal: "路径含 .. 穿越",
};

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

export function isStrictlyUnderSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): boolean {
  return roots.some((root) => path.startsWith(`${root}/`));
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

export function checkDescendant(
  path: string,
  roots: readonly string[] = SAFETY_ROOTS,
): { ok: true; path: string } | { ok: false; reason: string; error: PathGuardError } {
  const parsed = parseSafetyPath(path);
  if (!parsed.ok) {
    return { ok: false, reason: GUARD_REASON[parsed.error], error: parsed.error };
  }
  if (!isStrictlyUnderSafety(parsed.path, roots)) {
    return { ok: false, reason: GUARD_REASON.outside_root, error: "outside_root" };
  }
  return { ok: true, path: parsed.path };
}

export function joinPath(dir: string, name: string): string {
  if (dir === "/") return `/${name}`;
  return `${dir.replace(/\/+$/, "")}/${name}`;
}

export function parentOf(path: string): string | null {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return null;
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

export function parentWithinSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): string | null {
  const parent = parentOf(path);
  if (parent === null || parent === "/") return null;
  return isWithinSafety(parent, roots) ? parent : null;
}

export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "名称为空";
  if (trimmed === "." || trimmed === "..") return trimmed;
  if (/[/\\]/.test(trimmed) || trimmed.includes("\0")) return "含路径分隔符";
  return null;
}
