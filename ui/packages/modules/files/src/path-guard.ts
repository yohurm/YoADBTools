/**
 * 浏览路径安全根（ADR-v6-013 的 UI 镜像）。core 仍强制校验，不信任本层。
 */

import { SAFETY_ROOTS } from "@yohu/api";

export function isWithinSafety(path: string, roots: readonly string[] = SAFETY_ROOTS): boolean {
  return roots.some((root) => path === root || path.startsWith(`${root}/`));
}

export function guardBrowsePath(
  path: string,
  roots: readonly string[] = SAFETY_ROOTS,
): { ok: true; path: string } | { ok: false; reason: string } {
  if (!isWithinSafety(path, roots)) {
    return { ok: false, reason: "路径不在安全根内" };
  }
  return { ok: true, path };
}
