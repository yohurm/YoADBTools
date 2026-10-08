/**
 * 命令管理草稿模型 + DTO ↔ 草稿转换。
 * 选区在 manager/store；换位几何走 @yohu/ui；校验在 core。
 */

import {
  COMMAND_LIBRARY_SCHEMA_VERSION,
  alignParams,
  entryIsCommand,
  placeholderSlots,
  type CommandLibraryDto,
  type CommandParamDto,
  type LibraryEntryDto,
} from "@yohu/api";

export interface DraftStep {
  id: string;
  template: string;
  params: CommandParamDto[];
}

export type DraftCommand = {
  kind: "command";
  id: string;
  name: string;
  template: string;
  params: CommandParamDto[];
};
export type DraftBlock = {
  kind: "block";
  id: string;
  name: string;
  gap_ms: number;
  steps: DraftStep[];
};
export type DraftEntry = DraftCommand | DraftBlock;

export interface DraftGroup {
  id: string;
  name: string;
  entries: DraftEntry[];
}

export interface DraftState {
  groups: DraftGroup[];
}

function blankTemplate(): { template: string; params: CommandParamDto[] } {
  return { template: "", params: [] };
}

function blankName(): { name: string } {
  return { name: "" };
}

export const emptyCommand = (id: string): DraftCommand => ({
  kind: "command",
  id,
  ...blankName(),
  ...blankTemplate(),
});

export const emptyStep = (id: string): DraftStep => ({ id, ...blankTemplate() });

export const emptyBlock = (id: string, stepId: string): DraftBlock => ({
  kind: "block",
  id,
  ...blankName(),
  gap_ms: 0,
  steps: [emptyStep(stepId)],
});

export const emptyGroup = (id: string): DraftGroup => ({ id, ...blankName(), entries: [] });

let draftId = 0;
export const nextDraftId = (prefix: string): string => `${prefix}-draft-${++draftId}`;

function groupIdentity<T, U>(
  group: { id: string; name: string; entries: readonly T[] },
  mapEntry: (entry: T) => U,
): { id: string; name: string; entries: U[] } {
  return {
    id: group.id,
    name: group.name,
    entries: group.entries.map(mapEntry),
  };
}

/** 命令库 DTO → 编辑器草稿。 */
export function toDraft(library: CommandLibraryDto): DraftState {
  return {
    groups: library.groups.map((g) => groupIdentity(g, entryToDraft)),
  };
}

/** 编辑器草稿 → 命令库 DTO（提交前转换；校验在 core）。 */
export function fromDraft(draft: DraftState): CommandLibraryDto {
  return {
    ...librarySchema(),
    groups: draft.groups.map((g) => groupIdentity(g, entryFromDraft)),
  };
}

function draftParams(params: CommandParamDto[] | undefined): CommandParamDto[] {
  return params ?? [];
}

function entryIdentity(entry: { id: string; name: string }): { id: string; name: string } {
  return { id: entry.id, name: entry.name };
}

function blockGap(entry: { gap_ms: number }): { gap_ms: number } {
  return { gap_ms: entry.gap_ms };
}

function librarySchema(): Pick<CommandLibraryDto, "schema_version"> {
  return { schema_version: COMMAND_LIBRARY_SCHEMA_VERSION };
}

function entryToDraft(entry: LibraryEntryDto): DraftEntry {
  if (entryIsCommand(entry)) {
    return {
      kind: "command",
      ...entryIdentity(entry),
      template: entry.template,
      params: draftParams(entry.params),
    };
  }
  return {
    kind: "block",
    ...entryIdentity(entry),
    ...blockGap(entry),
    steps: entry.steps.map((step) => ({
      id: nextDraftId("s"),
      template: step.template,
      params: draftParams(step.params),
    })),
  };
}

/** 对齐后的参数。空列表不进 DTO。命令和步骤都认这一把。 */
function withPublishedParams(
  template: string,
  params: CommandParamDto[],
): { template: string; params?: CommandParamDto[] } {
  const aligned = alignParams(placeholderSlots(template), params);
  return aligned.length > 0 ? { template, params: aligned } : { template };
}

function entryFromDraft(entry: DraftEntry): LibraryEntryDto {
  if (entryIsCommand(entry)) {
    return {
      kind: "command",
      ...entryIdentity(entry),
      ...withPublishedParams(entry.template, entry.params),
    };
  }
  return {
    kind: "block",
    ...entryIdentity(entry),
    ...blockGap(entry),
    steps: entry.steps.map((step) => withPublishedParams(step.template, step.params)),
  };
}
