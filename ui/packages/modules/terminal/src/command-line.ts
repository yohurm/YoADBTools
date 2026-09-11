/**
 * 命令行展示与占位符填充（与 core `placeholder_slots` / `fill` / `strip_leading_adb` 对齐）。
 */

import type { CommandParamDto, LibraryEntryDto } from "@yohu/api";

/** 具体命令标签后的占位说明。`{n}` 是独立参数，不是 0..n 的个数。 */
export const COMMAND_PLACEHOLDER_HINT = "{n}代表使用命令时需要填入的独立参数";

export function commandTemplateLabel(): string {
  return `具体命令（${COMMAND_PLACEHOLDER_HINT}）`;
}

/** 模板中一处 `{n}`。`start` / `end` 是字符偏移（含花括号）。 */
export type PlaceholderToken = {
  index: number;
  start: number;
  end: number;
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
  return templatesSlots([template]);
}

/** 多段模板的独立 `{n}` 并集，按索引升序。 */
export function templatesSlots(templates: readonly string[]): number[] {
  const slots = new Set<number>();
  for (const template of templates) {
    for (const token of placeholderTokens(template)) slots.add(token.index);
  }
  return [...slots].sort((a, b) => a - b);
}

/** 独立 `{n}` 的个数；不是最大下标 + 1。 */
export function placeholderArity(template: string): number {
  return placeholderSlots(template).length;
}

/** 下一个可插入的独立 `{n}`：已用下标里最小的空号。 */
export function nextPlaceholderIndex(template: string): number {
  const used = placeholderSlots(template);
  for (let index = 0; ; index += 1) {
    if (!used.includes(index)) return index;
  }
}

/** 在字符区间 `[start, end)` 插入下一个 `{n}`。 */
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
  const next = `${chars.slice(0, from).join("")}${token}${chars.slice(to).join("")}`;
  return { template: next, caret: from + token.length };
}

function bindValues(slots: readonly number[], values: readonly string[]): Map<number, string> {
  const bound = new Map<number, string>();
  for (let i = 0; i < slots.length && i < values.length; i += 1) {
    bound.set(slots[i]!, values[i]!);
  }
  return bound;
}

function applyPlaceholders(
  template: string,
  byIndex: ReadonlyMap<number, string>,
  skipEmpty: boolean,
): string {
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
        const value = byIndex.get(n);
        if (value !== undefined && (!skipEmpty || value.length > 0)) {
          out += value;
          rest = after.slice(end + 1);
          continue;
        }
        out += `{${inner}}`;
        rest = after.slice(end + 1);
        continue;
      }
    }
    out += "{";
    rest = after;
  }
  return out;
}

/** 预览填充：空值或缺席的槽位原样保留 `{n}`。值按独立槽位顺序。 */
export function previewFill(template: string, values: readonly string[]): string {
  return applyPlaceholders(template, bindValues(placeholderSlots(template), values), true);
}

/** 展示行（`adb …`）光标映射回正文后插入。 */
export function insertPlaceholderAtDisplay(
  body: string,
  displayStart: number,
  displayEnd: number,
): { body: string; caret: number } {
  const prefix = commandBody(body).length === 0 ? 3 : 4;
  const max = commandBody(body).length;
  const start = Math.min(max, Math.max(0, displayStart - prefix));
  const end = Math.min(max, Math.max(start, displayEnd - prefix));
  const inserted = insertPlaceholder(commandBody(body), start, end);
  const nextPrefix = inserted.template.length === 0 ? 3 : 4;
  return { body: inserted.template, caret: nextPrefix + inserted.caret };
}

export function entryTemplates(entry: LibraryEntryDto): string[] {
  if (entry.kind === "command") return [entry.template];
  return entry.steps.map((step) => step.template);
}

export function entryParams(entry: LibraryEntryDto): CommandParamDto[] {
  return entry.params ?? [];
}

export function paramDescription(params: readonly CommandParamDto[], index: number): string {
  return params.find((param) => param.index === index)?.description ?? "";
}

export function setParamDescription(
  params: readonly CommandParamDto[],
  index: number,
  description: string,
): CommandParamDto[] {
  const next = params.filter((param) => param.index !== index);
  if (description.length === 0) {
    return next.sort((a, b) => a.index - b.index);
  }
  next.push({ index, description });
  return next.sort((a, b) => a.index - b.index);
}

export function alignParams(
  slots: readonly number[],
  params: readonly CommandParamDto[],
): CommandParamDto[] {
  const allowed = new Set(slots);
  const seen = new Set<number>();
  const out: CommandParamDto[] = [];
  for (const param of [...params].sort((a, b) => a.index - b.index)) {
    const description = param.description.trim();
    if (!allowed.has(param.index) || description.length === 0 || seen.has(param.index)) continue;
    seen.add(param.index);
    out.push({ index: param.index, description });
  }
  return out;
}

export function commandNeedsInput(template: string): boolean {
  return placeholderArity(template) > 0;
}

export function templatesArity(templates: readonly string[]): number {
  return templatesSlots(templates).length;
}

export function entrySlots(entry: LibraryEntryDto): number[] {
  if (entry.kind === "command") return placeholderSlots(entry.template);
  return templatesSlots(entry.steps.map((step) => step.template));
}

export function entryArity(entry: LibraryEntryDto): number {
  return entrySlots(entry).length;
}

export function entryNeedsInput(entry: LibraryEntryDto): boolean {
  return entryArity(entry) > 0;
}

/** 按独立槽位顺序替换 `{n}`；值本身含 `{n}` 样文本按字面量保留。个数必须与 domain `fill` 一致。 */
export function fillTemplate(template: string, values: readonly string[]): string {
  const slots = placeholderSlots(template);
  if (values.length !== slots.length) {
    throw new Error(`填充值数量不一致：需要 ${slots.length} 个，实际 ${values.length}`);
  }
  return applyPlaceholders(template, bindValues(slots, values), false);
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

/** 命令管理右键「复制」：与编辑器具体命令同一行（始终带 `adb`）。 */
export function commandCopyText(template: string): string {
  return formatAdbLine("-", template);
}

/** 多选复制：按序拼接具体命令，空正文跳过。 */
export function commandCopyLines(templates: readonly string[]): string {
  return templates
    .filter((template) => commandBody(template).length > 0)
    .map(commandCopyText)
    .join("\n");
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
