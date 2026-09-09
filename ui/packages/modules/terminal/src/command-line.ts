/**
 * 命令行展示与占位符填充（与 core `placeholder_arity` / `fill` / `strip_leading_adb` 对齐）。
 */

/** 模板中 `{n}` 的最大索引 + 1；无占位符则为 0。 */
export function placeholderArity(template: string): number {
  let maxIndex: number | undefined;
  let rest = template;
  while (true) {
    const pos = rest.indexOf("{");
    if (pos < 0) break;
    const after = rest.slice(pos + 1);
    const end = after.indexOf("}");
    if (end < 0) break;
    const inner = after.slice(0, end);
    if (/^\d+$/.test(inner)) {
      const n = Number.parseInt(inner, 10);
      maxIndex = maxIndex === undefined ? n : Math.max(maxIndex, n);
    }
    rest = after.slice(end + 1);
  }
  return maxIndex === undefined ? 0 : maxIndex + 1;
}

export function commandNeedsInput(template: string): boolean {
  return placeholderArity(template) > 0;
}

/** 按序替换 `{0}` `{1}` …；值本身含 `{n}` 样文本按字面量保留。 */
export function fillTemplate(template: string, values: string[]): string {
  let out = "";
  let rest = template;
  while (true) {
    const pos = rest.indexOf("{");
    if (pos < 0) {
      out += rest;
      break;
    }
    out += rest.slice(0, pos);
    const after = rest.slice(pos + 1);
    const end = after.indexOf("}");
    if (end >= 0) {
      const inner = after.slice(0, end);
      if (/^\d+$/.test(inner)) {
        const n = Number.parseInt(inner, 10);
        if (values[n] !== undefined) {
          out += values[n];
          rest = after.slice(end + 1);
          continue;
        }
      }
    }
    out += "{";
    rest = after;
  }
  return out;
}

/** 规范正文：去掉前导 `adb` / `adb.exe`。库、队列、发送共用这一形态。 */
export function commandBody(input: string): string {
  const trimmed = input.trim();
  if (trimmed.toLowerCase().startsWith("adb.exe")) {
    return trimmed.slice(7).trimStart();
  }
  if (trimmed.toLowerCase().startsWith("adb")) {
    const rest = trimmed.slice(3);
    if (rest.length === 0 || /^\s/.test(rest)) {
      return rest.trimStart();
    }
  }
  return trimmed;
}

/** 展示用完整行：始终 `adb [-s SERIAL] <正文>`。队列预览 / 树 title / IO 输入行同一源。 */
export function formatAdbLine(serial: string, input: string): string {
  const body = commandBody(input);
  const device = serial && serial !== "-" ? `-s ${serial}` : "";
  return ["adb", device, body].filter(Boolean).join(" ");
}

/** 交给 `terminal.exec` 的载荷；仅设置打开时补 `adb`。 */
export function toExecLine(input: string, prependAdb: boolean): string {
  const body = commandBody(input);
  if (!prependAdb) return body;
  return body ? `adb ${body}` : "adb";
}

/** stdout / stderr / 错误文案拼成一段输出。 */
export function combineOutput(stdout: string, stderr: string, fallback = ""): string {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  if (stdout) return stdout;
  if (stderr) return stderr;
  return fallback;
}
