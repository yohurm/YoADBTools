/**
 * 命令管理草稿模型 + DTO ↔ 草稿转换。
 * 选区在 manager/store；换位几何走 @yohu/ui；校验在 core。
 */

import {
  COMMAND_LIBRARY_SCHEMA_VERSION,
  type CommandLibraryDto,
  type CommandParamDto,
  type LibraryEntryDto,
} from "@yohu/api";

import { alignParams, placeholderSlots, templatesSlots } from "./command-line";

export interface DraftStep {
  id: string;
  template: string;
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
  params: CommandParamDto[];
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

export const emptyCommand = (id: string): DraftCommand => ({
  kind: "command",
  id,
  name: "",
  template: "",
  params: [],
});

export const emptyStep = (id: string): DraftStep => ({ id, template: "" });

export const emptyBlock = (id: string, stepId: string): DraftBlock => ({
  kind: "block",
  id,
  name: "",
  gap_ms: 0,
  steps: [emptyStep(stepId)],
  params: [],
});

export const emptyGroup = (id: string): DraftGroup => ({ id, name: "", entries: [] });

let draftId = 0;
export const nextDraftId = (prefix: string): string => `${prefix}-draft-${++draftId}`;

/** 命令库 DTO → 编辑器草稿。 */
export function toDraft(library: CommandLibraryDto): DraftState {
  return {
    groups: library.groups.map((g) => ({
      id: g.id,
      name: g.name,
      entries: g.entries.map(entryToDraft),
    })),
  };
}

/** 编辑器草稿 → 命令库 DTO（提交前转换；校验在 core）。 */
export function fromDraft(draft: DraftState): CommandLibraryDto {
  return {
    schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
    groups: draft.groups.map((g) => ({
      id: g.id,
      name: g.name,
      entries: g.entries.map(entryFromDraft),
    })),
  };
}

function entryToDraft(entry: LibraryEntryDto): DraftEntry {
  if (entry.kind === "command") {
    return {
      kind: "command",
      id: entry.id,
      name: entry.name,
      template: entry.template,
      params: entry.params ?? [],
    };
  }
  return {
    kind: "block",
    id: entry.id,
    name: entry.name,
    gap_ms: entry.gap_ms,
    steps: entry.steps.map((step) => ({ id: nextDraftId("s"), template: step.template })),
    params: entry.params ?? [],
  };
}

function entryFromDraft(entry: DraftEntry): LibraryEntryDto {
  if (entry.kind === "command") {
    const params = alignParams(placeholderSlots(entry.template), entry.params);
    return {
      kind: "command",
      id: entry.id,
      name: entry.name,
      template: entry.template,
      ...(params.length > 0 ? { params } : {}),
    };
  }
  const params = alignParams(
    templatesSlots(entry.steps.map((step) => step.template)),
    entry.params,
  );
  return {
    kind: "block",
    id: entry.id,
    name: entry.name,
    gap_ms: entry.gap_ms,
    steps: entry.steps.map((step) => ({ template: step.template })),
    ...(params.length > 0 ? { params } : {}),
  };
}
