/**
 * 用户输入 → 设备绝对 POSIX 路径（只做句法，不管安全根）。
 * 策略按固定顺序串联；core RemotePath 仍拒绝未折叠的 `..`，本层先消掉。
 */

export type PathStrategy =
  | "unquote"
  | "file-uri"
  | "separators"
  | "host-reject"
  | "alias"
  | "relative"
  | "collapse";

export type PathParseOk = { ok: true; path: string; applied: PathStrategy[] };
export type PathParseErr = { ok: false; reason: string; applied: PathStrategy[] };
export type PathParseResult = PathParseOk | PathParseErr;

/** 最长前缀优先。别名只改写法，不扩大安全根。 */
export const PATH_ALIASES: readonly (readonly [string, string])[] = [
  ["/mnt/shell/emulated/0", "/storage/emulated/0"],
  ["/storage/emulated/legacy", "/storage/emulated/0"],
  ["/storage/self/primary", "/sdcard"],
  ["/mnt/sdcard", "/sdcard"],
];

const BARE_ALIASES: readonly (readonly [string, string])[] = [
  ["~", "/sdcard"],
  ["sdcard", "/sdcard"],
];

export function parseRemotePath(raw: string, current: string): PathParseResult {
  const applied: PathStrategy[] = [];
  let text = raw.trim();
  if (!text) return fail("路径为空", applied);
  if (text.includes("\0")) return fail("路径含非法字符", applied);

  const unquoted = unquote(text);
  if (unquoted !== text) {
    applied.push("unquote");
    text = unquoted;
    if (!text) return fail("路径为空", applied);
  }

  const withoutUri = stripFileUri(text);
  if (withoutUri !== text) {
    applied.push("file-uri");
    text = withoutUri;
  }

  const posix = text.replace(/\\/g, "/");
  if (posix !== text) {
    applied.push("separators");
    text = posix;
  }

  if (isHostPath(text)) return fail("不是设备路径", [...applied, "host-reject"]);

  const aliased = expandAliases(text);
  if (aliased !== text) {
    applied.push("alias");
    text = aliased;
  }

  if (!text.startsWith("/")) {
    applied.push("relative");
    text = joinAbs(current, text);
  }

  const collapsed = collapseDotSegments(text);
  if (!collapsed.ok) return fail(collapsed.reason, [...applied, "collapse"]);
  if (collapsed.path !== text) applied.push("collapse");
  return { ok: true, path: collapsed.path, applied };
}

function fail(reason: string, applied: PathStrategy[]): PathParseErr {
  return { ok: false, reason, applied };
}

function unquote(text: string): string {
  if (text.length >= 2) {
    const a = text[0];
    const b = text[text.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      return text.slice(1, -1).trim();
    }
  }
  return text;
}

function stripFileUri(text: string): string {
  if (!/^file:/i.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol.toLowerCase() !== "file:") return text;
    let path = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== "localhost") {
      path = `/${url.hostname}${path}`;
    }
    if (/^\/[a-zA-Z]:/.test(path)) return path.slice(1);
    return path || text;
  } catch {
    return text.replace(/^file:\/\//i, "");
  }
}

function isHostPath(text: string): boolean {
  return /^[a-zA-Z]:/.test(text) || text.startsWith("//");
}

function expandAliases(text: string): string {
  for (const [from, to] of BARE_ALIASES) {
    if (text === from) return to;
    if (text.startsWith(`${from}/`)) return `${to}${text.slice(from.length)}`;
  }
  for (const [from, to] of PATH_ALIASES) {
    if (text === from || text.startsWith(`${from}/`)) {
      return `${to}${text.slice(from.length)}`;
    }
  }
  return text;
}

function joinAbs(base: string, rel: string): string {
  const root = base.startsWith("/") ? base : `/${base}`;
  if (rel === "" || rel === ".") return normalizeSlashes(root);
  return normalizeSlashes(`${root.replace(/\/+$/, "")}/${rel}`);
}

function normalizeSlashes(path: string): string {
  return path.replace(/\/{2,}/g, "/");
}

function collapseDotSegments(path: string): { ok: true; path: string } | { ok: false; reason: string } {
  const parts: string[] = [];
  for (const seg of normalizeSlashes(path).split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return { ok: false, reason: "路径穿越安全根" };
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return { ok: true, path: parts.length === 0 ? "/" : `/${parts.join("/")}` };
}
