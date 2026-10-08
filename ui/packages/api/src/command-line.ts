/**
 * 占位符 / 拆行 / 去前导 adb / 拼输出。
 * 与 yohu-domain `placeholder_*` / `split_command_line` / `strip_leading_adb` / `combine_output` 同一套 testdata。
 */

import type { CommandParamDto } from "./types";

export type PlaceholderToken = {
  index: number;
  start: number;
  end: number;
};

export type StepParamSlot = {
  step: number;
  index: number;
};

/** 按出现顺序列出全部 `{n}`。`{abc}` 等非数字片段跳过。 */
export function placeholderTokens(template: string): PlaceholderToken[] {
  const tokens: PlaceholderToken[] = [];
  let rest = template;
  let base = 0;
  while (true) {
    const pos = rest.indexOf("{");
    if (pos < 0) break;
    const after = rest.slice(pos + 1);
    const end = after.indexOf("}");
    if (end < 0) break;
    const inner = after.slice(0, end);
    const tokenChars = inner.length + 2;
    if (/^\d+$/.test(inner)) {
      tokens.push({
        index: Number.parseInt(inner, 10),
        start: base + pos,
        end: base + pos + tokenChars,
      });
    }
    rest = after.slice(end + 1);
    base += pos + tokenChars;
  }
  return tokens;
}

/** 模板中实际出现的独立 `{n}`，按索引升序。 */
export function placeholderSlots(template: string): number[] {
  const slots = new Set<number>();
  for (const token of placeholderTokens(template)) slots.add(token.index);
  return [...slots].sort((a, b) => a - b);
}

export function placeholderArity(template: string): number {
  return placeholderSlots(template).length;
}

export function nextPlaceholderIndex(template: string): number {
  const used = placeholderSlots(template);
  for (let index = 0; ; index += 1) {
    if (!used.includes(index)) return index;
  }
}

/** 在字符区间 `[start, end)` 插入下一个 `{n}`。下标按 Unicode 标量。 */
export function insertPlaceholder(
  template: string,
  start: number,
  end: number,
): { template: string; caret: number } {
  const len = [...template].length;
  const from = Math.min(Math.max(0, start), len);
  const to = Math.min(Math.max(from, end), len);
  const chars = [...template];
  const pad = from > 0 && !/\s/.test(chars[from - 1] ?? "");
  const token = `${pad ? " " : ""}{${nextPlaceholderIndex(template)}}`;
  const next = `${joinedChars(chars.slice(0, from))}${token}${joinedChars(chars.slice(to))}`;
  return { template: next, caret: from + token.length };
}

export function stepParamSlots(templates: readonly string[]): StepParamSlot[] {
  return templates.flatMap((template, offset) =>
    placeholderSlots(template).map((index) => ({ step: offset + 1, index })),
  );
}

function bindValues(slots: readonly number[], values: readonly string[]): Map<number, string> {
  const bound = new Map<number, string>();
  for (let i = 0; i < slots.length && i < values.length; i += 1) {
    bound.set(slots[i]!, values[i]!);
  }
  return bound;
}

/** 填充只消费 `placeholderTokens`。`{n}` 文法不在这里再扫。 */
function applyPlaceholders(
  template: string,
  byIndex: ReadonlyMap<number, string>,
  skipEmpty: boolean,
): string {
  const tokens = placeholderTokens(template);
  let out = "";
  let cursor = 0;
  for (const token of tokens) {
    out += template.slice(cursor, token.start);
    const literal = template.slice(token.start, token.end);
    const value = byIndex.get(token.index);
    if (value !== undefined && (!skipEmpty || value.length > 0)) out += value;
    else out += literal;
    cursor = token.end;
  }
  return out + template.slice(cursor);
}

export function previewFill(template: string, values: readonly string[]): string {
  return applyPlaceholders(template, bindValues(placeholderSlots(template), values), true);
}

export function fillTemplate(template: string, values: readonly string[]): string {
  const slots = placeholderSlots(template);
  if (values.length !== slots.length) {
    throw new Error(`填充值数量不一致：需要 ${slots.length} 个，实际 ${values.length}`);
  }
  return applyPlaceholders(template, bindValues(slots, values), false);
}

export function compareParamIndex(a: CommandParamDto, b: CommandParamDto): number {
  return a.index - b.index;
}

export function alignParams(
  slots: readonly number[],
  params: readonly CommandParamDto[],
): CommandParamDto[] {
  const allowed = new Set(slots);
  const seen = new Set<number>();
  const out: CommandParamDto[] = [];
  for (const param of [...params].sort(compareParamIndex)) {
    const description = param.description.trim();
    if (!allowed.has(param.index) || description.length === 0 || seen.has(param.index)) continue;
    seen.add(param.index);
    out.push({ index: param.index, description });
  }
  return out;
}

export function paramDescription(params: readonly CommandParamDto[], index: number): string {
  return params.find((param) => param.index === index)?.description ?? "";
}

function joinedChars(chars: string[]): string {
  return chars.join("");
}

function loweredCommand(trimmed: string): string {
  return trimmed.toLowerCase();
}

function argPending(current: string): boolean {
  return current.length > 0;
}

function commitArg(args: string[], current: string): void {
  args.push(current);
}

/** 去掉前导 `adb` / `adb.exe`。与 domain `strip_leading_adb` 同一 testdata。 */
export function commandBody(input: string): string {
  const trimmed = input.trim();
  if (loweredCommand(trimmed).startsWith("adb.exe")) {
    return trimmed.slice(7).trimStart();
  }
  if (loweredCommand(trimmed).startsWith("adb")) {
    const rest = trimmed.slice(3);
    if (rest.length === 0 || /^\s/.test(rest)) {
      return rest.trimStart();
    }
  }
  return trimmed;
}

/** 交给 `terminal.exec` 的载荷；仅设置打开时补 `adb`。 */
export function toExecLine(input: string, prependAdb: boolean): string {
  const body = commandBody(input);
  if (!prependAdb) return body;
  return body ? `adb ${body}` : "adb";
}

export function combineOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) return `${stdout}\n${stderr}`;
  if (stdout) return stdout;
  if (stderr) return stderr;
  return "";
}

/** 双引号分组、反斜杠转义双引号。与 domain `split_command_line` 同一 testdata。 */
export function splitCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  const chars = [...input];
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i]!;
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "\\" && chars[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if ((c === " " || c === "\t") && !inQuotes) {
      if (argPending(current)) {
        commitArg(args, current);
        current = "";
      }
      continue;
    }
    current += c;
  }
  if (argPending(current)) commitArg(args, current);
  return args;
}
