/**
 * 命令行展示铬：`adb` 前缀、填参栏字段、复制。
 * `{n}` / 拆行 / 去前导 adb / 拼输出在 @yohu/api（镜像 yohu-domain）。
 */

import {
  commandBody,
  insertPlaceholder,
  paramDescription,
  placeholderArity,
  placeholderSlots,
  type StepParamSlot,
} from "@yohu/api";
import type { CommandParamDto, LibraryEntryDto } from "@yohu/api";

export {
  alignParams,
  combineOutput,
  commandBody,
  fillTemplate,
  paramDescription,
  placeholderSlots,
  toExecLine,
  type StepParamSlot,
} from "@yohu/api";

/** 具体命令标签后的占位说明。`{n}` 是独立参数，不是 0..n 的个数。 */
export const COMMAND_PLACEHOLDER_HINT = "{n}代表使用命令时需要填入的独立参数";

export function commandTemplateLabel(): string {
  return `具体命令（${COMMAND_PLACEHOLDER_HINT}）`;
}

export function stepParamLabel(slot: StepParamSlot): string {
  return `${slot.step}-${slot.index}`;
}

/** `formatAdbLine("-", body)` 里正文之前的前缀长度（含空格）。 */
export function adbDisplayPrefix(input: string): number {
  const body = commandBody(input);
  return formatAdbLine("-", body).length - body.length;
}

/** 展示行（`adb …`）光标映射回正文后插入下一个 `{n}`。 */
export function insertPlaceholderAtDisplay(
  body: string,
  displayStart: number,
  displayEnd: number,
): { body: string; caret: number } {
  const text = commandBody(body);
  const prefix = adbDisplayPrefix(text);
  const max = text.length;
  const start = Math.min(max, Math.max(0, displayStart - prefix));
  const end = Math.min(max, Math.max(start, displayEnd - prefix));
  const inserted = insertPlaceholder(text, start, end);
  return { body: inserted.template, caret: adbDisplayPrefix(inserted.template) + inserted.caret };
}

export function entryTemplates(entry: LibraryEntryDto): string[] {
  if (entry.kind === "command") return [entry.template];
  return entry.steps.map((step) => step.template);
}

/** 填参栏一行。命令标签 `{n}`；块标签 `1-0`。 */
export type FillField = {
  key: string;
  label: string;
  description: string;
};

export function commandFillFields(template: string, params: readonly CommandParamDto[]): FillField[] {
  return placeholderSlots(template).map((index) => {
    const description = paramDescription(params, index).trim();
    return { key: String(index), label: `{${index}}`, description };
  });
}

export function blockFillFields(
  steps: readonly { template: string; params?: readonly CommandParamDto[] }[],
): FillField[] {
  return steps.flatMap((step, offset) => {
    const stepNo = offset + 1;
    return placeholderSlots(step.template).map((index) => {
      const description = paramDescription(step.params ?? [], index).trim();
      return { key: stepParamLabel({ step: stepNo, index }), label: stepParamLabel({ step: stepNo, index }), description };
    });
  });
}

export function entryFillFields(entry: LibraryEntryDto): FillField[] {
  if (entry.kind === "command") return commandFillFields(entry.template, entry.params ?? []);
  return blockFillFields(entry.steps);
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

export function commandNeedsInput(template: string): boolean {
  return placeholderArity(template) > 0;
}

export function entryArity(entry: LibraryEntryDto): number {
  return entryFillFields(entry).length;
}

export function entryNeedsInput(entry: LibraryEntryDto): boolean {
  return entryArity(entry) > 0;
}

/** 命令 1 步；块按 steps 条数。组/块进度事件数 = 步数 × 设备数。 */
export function entryStepCount(entry: LibraryEntryDto): number {
  return entry.kind === "command" ? 1 : entry.steps.length;
}

export function groupStepCount(group: { entries: readonly LibraryEntryDto[] }): number {
  return group.entries.reduce((count, entry) => count + entryStepCount(entry), 0);
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
