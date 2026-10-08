/**
 * 命令行展示铬：`adb` 前缀、填参栏字段、复制、库条目图标。
 * `{n}` / 拆行 / 去前导 adb / 拼输出在 @yohu/api（镜像 yohu-domain）。
 */

import {
  commandBody,
  compareParamIndex,
  entryIsBlock,
  entryIsCommand,
  insertPlaceholder,
  paramDescription,
  placeholderArity,
  placeholderSlots,
  type StepParamSlot,
} from "@yohu/api";
import type { CommandParamDto, LibraryEntryDto } from "@yohu/api";
import type { IconName } from "@yohu/ui";

/** 发送队列里的自由输入行。库条目没有这一种。 */
export function queuedIsLine<E extends { kind: string }>(
  item: E,
): item is Extract<E, { kind: "line" }> {
  return item.kind === "line";
}

/** 具体命令标签后的占位说明。`{n}` 是独立参数，不是 0..n 的个数。 */
export const COMMAND_PLACEHOLDER_HINT = "{n}代表使用命令时需要填入的独立参数";

export function commandTemplateLabel(): string {
  return `具体命令（${COMMAND_PLACEHOLDER_HINT}）`;
}

export function stepParamLabel(slot: StepParamSlot): string {
  return `${slot.step}-${slot.index}`;
}

/** 命令占位符的标签。填参栏和参数描述都认这一把。 */
export function commandParamLabel(index: number): string {
  return `{${index}}`;
}

function lineBody(input: string): string {
  return commandBody(input);
}

/** 无设备时的展示行。前缀、复制、树标题和填参原文都走这一把。 */
function bareAdbLine(input: string): string {
  return formatAdbLine("-", input);
}

/** 展示行正文之前的前缀长度（含空格）。 */
export function adbDisplayPrefix(input: string): number {
  const body = lineBody(input);
  return bareAdbLine(body).length - body.length;
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
  if (entryIsCommand(entry)) return [entry.template];
  return entry.steps.map((step) => step.template);
}

/** 命令库树和导入清单共用的条目图标。 */
export function libraryEntryIcon(kind: LibraryEntryDto["kind"]): IconName {
  return entryIsBlock({ kind }) ? "block" : "terminal";
}

/** 填参栏一行。命令标签 `{n}`；块标签 `1-0`。 */
export type FillField = {
  key: string;
  label: string;
  description: string;
};

function fillDescription(params: readonly CommandParamDto[] | undefined, index: number): string {
  return paramDescription(params ?? [], index).trim();
}

export function commandFillFields(template: string, params: readonly CommandParamDto[] | undefined): FillField[] {
  return placeholderSlots(template).map((index) => ({
    key: String(index),
    label: commandParamLabel(index),
    description: fillDescription(params, index),
  }));
}

export function blockFillFields(
  steps: readonly { template: string; params?: readonly CommandParamDto[] }[],
): FillField[] {
  return steps.flatMap((step, offset) => {
    const stepNo = offset + 1;
    return placeholderSlots(step.template).map((index) => {
      const slot = stepParamLabel({ step: stepNo, index });
      return { key: slot, label: slot, description: fillDescription(step.params, index) };
    });
  });
}

export function entryFillFields(entry: LibraryEntryDto): FillField[] {
  if (entryIsCommand(entry)) return commandFillFields(entry.template, entry.params);
  return blockFillFields(entry.steps);
}

export function setParamDescription(
  params: readonly CommandParamDto[],
  index: number,
  description: string,
): CommandParamDto[] {
  const next = params.filter((param) => param.index !== index);
  if (description.length > 0) next.push({ index, description });
  return next.sort(compareParamIndex);
}

export function countNeedsInput(count: number): boolean {
  return count > 0;
}

export function commandNeedsInput(template: string): boolean {
  return countNeedsInput(placeholderArity(template));
}

export function entryArity(entry: LibraryEntryDto): number {
  return entryFillFields(entry).length;
}

export function entryNeedsInput(entry: LibraryEntryDto): boolean {
  return countNeedsInput(entryArity(entry));
}

/** 命令 1 步；块按 steps 条数。组/块进度事件数 = 步数 × 设备数。 */
export function entryStepCount(entry: LibraryEntryDto): number {
  return entryIsCommand(entry) ? 1 : entry.steps.length;
}

export function groupStepCount(group: { entries: readonly LibraryEntryDto[] }): number {
  return group.entries.reduce((count, entry) => count + entryStepCount(entry), 0);
}

/** 展示用完整行：始终 `adb [-s SERIAL] <正文>`。队列预览 / 树 title / IO 输入行同一源。 */
export function formatAdbLine(serial: string, input: string): string {
  const body = lineBody(input);
  const device = serial && serial !== "-" ? `-s ${serial}` : "";
  return ["adb", device, body].filter(Boolean).join(" ");
}

/** 命令管理右键「复制」：与编辑器具体命令同一行（始终带 `adb`）。 */
export function commandCopyText(template: string): string {
  return bareAdbLine(template);
}

/** 多选复制：按序拼接具体命令，空正文跳过。 */
export function commandCopyLines(templates: readonly string[]): string {
  return templates
    .filter((template) => commandBody(template).length > 0)
    .map(commandCopyText)
    .join("\n");
}
