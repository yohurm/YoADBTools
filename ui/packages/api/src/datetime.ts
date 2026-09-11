/**
 * 墙钟解析单点。与 yohu-domain::datetime 同一套 testdata/datetime.json。
 * 日志/终端带毫秒；文件只到秒。禁止把「只有时分」补成秒或毫秒。
 */

/** `2026-09-10 17:20:45.123` */
export const DATETIME_DISPLAY_LEN = 23;
/** `2026-09-10 17:20:45` */
export const DATETIME_SECONDS_LEN = 19;

export function formatDateTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millis: number,
): string | null {
  if (!validParts(year, month, day, hour, minute, second, millis)) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}.${pad(millis, 3)}`;
}

export function formatDateTimeSeconds(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): string | null {
  if (!validParts(year, month, day, hour, minute, second, 0)) return null;
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)} ${pad(hour, 2)}:${pad(minute, 2)}:${pad(second, 2)}`;
}

export function canonicalizeDateTime(raw: string): string | null {
  const p = parseParts(raw);
  if (!p) return null;
  return formatDateTime(p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
}

export function canonicalizeDateTimeSeconds(raw: string): string | null {
  const p = parseParts(raw);
  if (!p) return null;
  return formatDateTimeSeconds(p[0], p[1], p[2], p[3], p[4], p[5]);
}

/** 本地墙钟。终端 IO 行。 */
export function formatDateTimeFromMs(ms: number): string {
  const date = new Date(ms);
  return formatDateTime(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
  )!;
}

function validParts(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millis: number,
): boolean {
  return !(
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    millis > 999 ||
    year < 0 ||
    hour < 0 ||
    minute < 0 ||
    second < 0 ||
    millis < 0
  );
}

function parseParts(raw: string): [number, number, number, number, number, number, number] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withoutZ = trimmed.endsWith("Z") ? trimmed.slice(0, -1) : trimmed;
  const tokens = withoutZ.split(/\s+/).filter((token) => token.length > 0);
  let date: string;
  let time: string;
  if (tokens.length === 1) {
    const split = tokens[0]!.split("T");
    if (split.length !== 2) return null;
    date = split[0]!;
    time = split[1]!;
  } else if (tokens.length === 2) {
    date = tokens[0]!;
    time = tokens[1]!;
  } else if (tokens.length === 3 && isZoneToken(tokens[2]!)) {
    date = tokens[0]!;
    time = tokens[1]!;
  } else {
    return null;
  }
  const ymd = parseDate(date);
  const hms = parseTime(time);
  if (!ymd || !hms) return null;
  return [ymd[0], ymd[1], ymd[2], hms[0], hms[1], hms[2], hms[3]];
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function isZoneToken(token: string): boolean {
  const first = token.charAt(0);
  if (first !== "+" && first !== "-") return false;
  let digits = 0;
  for (const ch of token) {
    if (ch >= "0" && ch <= "9") digits += 1;
  }
  return digits >= 4;
}

function parseDigits(s: string): number | null {
  if (!s || !/^\d+$/.test(s)) return null;
  return Number(s);
}

function parseDate(s: string): [number, number, number] | null {
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day || year.length !== 4 || month.length !== 2 || day.length !== 2) {
    return null;
  }
  const y = parseDigits(year);
  const m = parseDigits(month);
  const d = parseDigits(day);
  if (y === null || m === null || d === null) return null;
  return [y, m, d];
}

function parseTime(s: string): [number, number, number, number] | null {
  const dot = s.indexOf(".");
  const hms = dot < 0 ? s : s.slice(0, dot);
  const frac = dot < 0 ? null : s.slice(dot + 1);
  const parts = hms.split(":");
  if (parts.length !== 3) return null;
  const [hour, minute, second] = parts;
  if (!hour || !minute || !second || hour.length !== 2 || minute.length !== 2 || second.length !== 2) {
    return null;
  }
  const h = parseDigits(hour);
  const mi = parseDigits(minute);
  const se = parseDigits(second);
  if (h === null || mi === null || se === null) return null;
  const millis = frac === null ? 0 : parseFracMillis(frac);
  if (millis === null) return null;
  return [h, mi, se, millis];
}

function parseFracMillis(frac: string): number | null {
  let digits = "";
  for (const ch of frac) {
    if (ch < "0" || ch > "9") return null;
    if (digits.length < 3) digits += ch;
  }
  if (!digits) return null;
  return parseDigits(digits.padEnd(3, "0"));
}
