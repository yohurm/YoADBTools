/**
 * 用户输入 → 设备绝对 POSIX 路径（只做句法，不管安全根）。
 * 与 yohu-domain::path_input 同一套 testdata/path_input.json。
 * 不折叠 `.` / `..` / `//`；穿越只由 safety 判定。
 */

export type PathStrategy = "unquote" | "file-uri" | "separators" | "host-reject" | "alias" | "relative";

export type PathParseOk = { ok: true; path: string; applied: PathStrategy[] };
export type PathParseErr = { ok: false; reason: string; applied: PathStrategy[] };
export type PathParseResult = PathParseOk | PathParseErr;

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

  return { ok: true, path: text, applied };
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

function percentDecode(s: string): string {
  return s.replace(/%([0-9a-fA-F]{2})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function stripFileUri(text: string): string {
  if (text.length < 5 || text.slice(0, 5).toLowerCase() !== "file:") return text;
  let rest = text.slice(5).replace(/^\/+/, "");
  if (!rest) return text;
  if (rest === "localhost") rest = "";
  else if (rest.startsWith("localhost/")) rest = rest.slice("localhost/".length);
  if (rest.length >= 2 && rest.charAt(1) === ":") return percentDecode(rest);
  return `/${percentDecode(rest)}`;
}

function isHostPath(text: string): boolean {
  return /^[a-zA-Z]:/.test(text) || text.startsWith("//");
}

function expandOne(text: string, from: string, to: string): string | null {
  if (text === from) return to;
  if (text.startsWith(`${from}/`)) return `${to}${text.slice(from.length)}`;
  return null;
}

function expandAliases(text: string): string {
  for (const [from, to] of BARE_ALIASES) {
    const next = expandOne(text, from, to);
    if (next != null) return next;
  }
  for (const [from, to] of PATH_ALIASES) {
    const next = expandOne(text, from, to);
    if (next != null) return next;
  }
  return text;
}

function joinAbs(base: string, rel: string): string {
  const root = base.startsWith("/") ? base : `/${base}`;
  return `${root.replace(/\/+$/, "")}/${rel}`;
}
