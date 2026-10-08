/**
 * 导入确认的勾选。组勾选只做级联；提交单位是条目 id。
 * 默认勾新项，已在库中的不勾。全选会带上重复项。
 */

import { importAlreadyPresent, type ImportGroupPreviewDto, type ImportPreviewDto } from "@yohu/api";

/** 预览行已在当前库。徽章和摘要共用这一句。 */
export const IMPORT_ALREADY_IN_LIBRARY = "已在库中";

function entryAlreadyPresent(entry: ImportGroupPreviewDto["entries"][number]): boolean {
  return importAlreadyPresent(entry.presence);
}

function copySelection(selected: ReadonlySet<string>): Set<string> {
  return new Set(selected);
}

function setChosen(next: Set<string>, id: string, on: boolean): void {
  if (on) next.add(id);
  else next.delete(id);
}

function entryChosen(selected: ReadonlySet<string>, entry: { id: string }): boolean {
  return selected.has(entry.id);
}

function eachPreviewGroup(
  preview: ImportPreviewDto,
  visit: (group: ImportGroupPreviewDto) => void,
): void {
  for (const group of preview.groups) visit(group);
}

function eachGroupEntry(
  group: ImportGroupPreviewDto,
  visit: (entry: ImportGroupPreviewDto["entries"][number]) => void,
): void {
  for (const entry of group.entries) visit(entry);
}

export interface ImportCommitSummary {
  add: number;
  overwrite: number;
}

export function allEntryIds(preview: ImportPreviewDto): string[] {
  return preview.groups.flatMap((group) => group.entries.map((entry) => entry.id));
}

export function defaultSelected(preview: ImportPreviewDto): Set<string> {
  const selected = new Set<string>();
  eachPreviewGroup(preview, (group) => {
    eachGroupEntry(group, (entry) => {
      if (!entryAlreadyPresent(entry)) selected.add(entry.id);
    });
  });
  return selected;
}

/** 这一组里有条目。组勾选和组复选框禁用都认这一把。 */
export function importGroupHasEntries(group: ImportGroupPreviewDto): boolean {
  return group.entries.length > 0;
}

/** 预览里至少有一条。全选勾选和全选禁用都认这一把。 */
export function importPreviewHasEntries(preview: ImportPreviewDto): boolean {
  return preview.groups.some(importGroupHasEntries);
}

export function isGroupChecked(group: ImportGroupPreviewDto, selected: ReadonlySet<string>): boolean {
  return importGroupHasEntries(group) && group.entries.every((entry) => entryChosen(selected, entry));
}

export function isAllChecked(preview: ImportPreviewDto, selected: ReadonlySet<string>): boolean {
  return importPreviewHasEntries(preview) && allEntryIds(preview).every((id) => selected.has(id));
}

export function toggleEntry(selected: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = copySelection(selected);
  setChosen(next, id, on);
  return next;
}

export function toggleGroup(
  group: ImportGroupPreviewDto,
  selected: ReadonlySet<string>,
  on: boolean,
): Set<string> {
  const next = copySelection(selected);
  eachGroupEntry(group, (entry) => {
    setChosen(next, entry.id, on);
  });
  return next;
}

export function toggleAll(preview: ImportPreviewDto, on: boolean): Set<string> {
  if (!on) return new Set();
  return new Set(allEntryIds(preview));
}

export function importOverview(preview: ImportPreviewDto): { groups: number; entries: number; existing: number } {
  let entries = 0;
  let existing = 0;
  eachPreviewGroup(preview, (group) => {
    eachGroupEntry(group, (entry) => {
      entries += 1;
      if (entryAlreadyPresent(entry)) existing += 1;
    });
  });
  return { groups: preview.groups.length, entries, existing };
}

export function importCommitSummary(
  preview: ImportPreviewDto,
  selected: ReadonlySet<string>,
): ImportCommitSummary {
  let add = 0;
  let overwrite = 0;
  eachPreviewGroup(preview, (group) => {
    eachGroupEntry(group, (entry) => {
      if (!entryChosen(selected, entry)) return;
      if (entryAlreadyPresent(entry)) overwrite += 1;
      else add += 1;
    });
  });
  return { add, overwrite };
}

export function importOverviewText(preview: ImportPreviewDto): string {
  const overview = importOverview(preview);
  return `${overview.groups} 组 · ${overview.entries} 条，其中 ${overview.existing} 条${IMPORT_ALREADY_IN_LIBRARY}`;
}

export function importCommitText(preview: ImportPreviewDto, selected: ReadonlySet<string>): string {
  const summary = importCommitSummary(preview, selected);
  return `将新增 ${summary.add} 条，覆盖 ${summary.overwrite} 条`;
}

/** 这次要写入的条数。页脚按钮和成功提示都认这一把。 */
export function importCommitCount(summary: ImportCommitSummary): number {
  return summary.add + summary.overwrite;
}

/** 页脚主按钮。未选时只写「导入」，由禁用态挡住提交。 */
export function importConfirmLabel(summary: ImportCommitSummary): string {
  const count = importCommitCount(summary);
  return count === 0 ? "导入" : `导入 ${count} 条`;
}
