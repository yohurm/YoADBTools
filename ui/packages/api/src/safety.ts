/**
 * 设备路径安全与路径代数。与 yohu-domain::safety 同一套 testdata。
 * core 仍强制校验，不信任本层。
 */

import { SAFETY_ROOTS } from "./identity";

export type PathGuardError = "outside_root" | "not_absolute" | "traversal";

/** 与领域 `outside_root_text` 同一句。路径是规范化后的绝对路径。 */
export function outsideRootText(path: string): string {
  return `路径不在安全根内: ${path}`;
}

/** 与领域 `not_absolute_text` 同一句。路径是用户原文。 */
export function notAbsoluteText(path: string): string {
  return `路径必须是绝对路径: ${path}`;
}

/** 与领域 `traversal_text` 同一句。路径是用户原文。 */
export function traversalText(path: string): string {
  return `路径含 .. 穿越: ${path}`;
}

function guardReason(error: Exclude<PathGuardError, "outside_root">, raw: string): string {
  return error === "not_absolute" ? notAbsoluteText(raw) : traversalText(raw);
}

/** 反斜杠换成斜杠。句法解析和规范化都问这一次。 */
export function posixSlashes(path: string): string {
  return path.replace(/\\/g, "/");
}

/** 以 `/` 开头才是设备绝对路径。规范化与句法解析都问这一次。 */
export function pathIsAbsolute(path: string): boolean {
  return path.startsWith("/");
}

/** 去掉尾部 `/`。拼接和上级都问这一次。 */
function withoutTrailingSlash(path: string): string {
  return path.replace(/\/+$/, "");
}

export function parseSafetyPath(
  raw: string,
): { ok: true; path: string } | { ok: false; error: Exclude<PathGuardError, "outside_root"> } {
  const replaced = posixSlashes(raw);
  if (!pathIsAbsolute(replaced)) {
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

/** 严格在某个根之下。前缀只写在这里。 */
function pathIsStrictlyUnder(path: string, root: string): boolean {
  return path.startsWith(`${root}/`);
}

export function isWithinSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): boolean {
  return roots.some((root) => path === root || pathIsStrictlyUnder(path, root));
}

export function isStrictlyUnderSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): boolean {
  return roots.some((root) => pathIsStrictlyUnder(path, root));
}

function parseFailed(
  parsed: { ok: true; path: string } | { ok: false; error: Exclude<PathGuardError, "outside_root"> },
): parsed is { ok: false; error: Exclude<PathGuardError, "outside_root"> } {
  return !parsed.ok;
}

function rejectedParse(
  parsed: { error: Exclude<PathGuardError, "outside_root"> },
  path: string,
): { ok: false; reason: string; error: Exclude<PathGuardError, "outside_root"> } {
  return { ok: false, reason: guardReason(parsed.error, path), error: parsed.error };
}

function outsideRoot(parsed: { path: string }): { ok: false; reason: string; error: "outside_root" } {
  return { ok: false, reason: outsideRootText(parsed.path), error: "outside_root" };
}

function acceptedPath(parsed: { path: string }): { ok: true; path: string } {
  return { ok: true, path: parsed.path };
}

export function guardBrowsePath(
  path: string,
  roots: readonly string[] = SAFETY_ROOTS,
): { ok: true; path: string } | { ok: false; reason: string; error: PathGuardError } {
  const parsed = parseSafetyPath(path);
  if (parseFailed(parsed)) return rejectedParse(parsed, path);
  if (!isWithinSafety(parsed.path, roots)) return outsideRoot(parsed);
  return acceptedPath(parsed);
}

export function checkDescendant(
  path: string,
  roots: readonly string[] = SAFETY_ROOTS,
): { ok: true; path: string } | { ok: false; reason: string; error: PathGuardError } {
  const parsed = parseSafetyPath(path);
  if (parseFailed(parsed)) return rejectedParse(parsed, path);
  if (!isStrictlyUnderSafety(parsed.path, roots)) return outsideRoot(parsed);
  return acceptedPath(parsed);
}

export function joinPath(dir: string, name: string): string {
  if (dir === "/") return `/${name}`;
  return `${withoutTrailingSlash(dir)}/${name}`;
}

export function parentOf(path: string): string | null {
  const trimmed = withoutTrailingSlash(path);
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

/** 与领域 `invalid_name_text` 同一句。`detail` 是载荷，不是整句。 */
export function invalidNameText(detail: string): string {
  return `条目名非法: ${detail}`;
}

/** 与领域 `ENTRY_NAME_EMPTY` 同一载荷。 */
export const ENTRY_NAME_EMPTY = "名称为空";
/** 与领域 `ENTRY_NAME_SEPARATOR` 同一载荷。 */
export const ENTRY_NAME_SEPARATOR = "含路径分隔符";

export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return invalidNameText(ENTRY_NAME_EMPTY);
  if (trimmed === "." || trimmed === "..") return invalidNameText(trimmed);
  if (/[/\\]/.test(trimmed) || trimmed.includes("\0")) return invalidNameText(ENTRY_NAME_SEPARATOR);
  return null;
}
