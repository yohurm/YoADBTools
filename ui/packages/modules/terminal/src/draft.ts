/**
 * 命令管理编辑器的草稿模型 + 纯转换（DTO ↔ 草稿）。
 * View 只消费本模块；提交前转换、校验在 core。
 */

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

export interface DraftCommand {
  id: string;
  name: string;
  template: string;
}

export interface DraftGroup {
  id: string;
  name: string;
  commands: DraftCommand[];
}

export interface DraftState {
  groups: DraftGroup[];
}

export const emptyCommand = (id: string): DraftCommand => ({
  id,
  name: "",
  template: "",
});

export const emptyGroup = (id: string): DraftGroup => ({ id, name: "", commands: [] });

let draftId = 0;
export const nextDraftId = (prefix: string): string => `${prefix}-draft-${++draftId}`;

/** 命令库 DTO → 编辑器草稿。 */
export function toDraft(library: CommandLibraryDto): DraftState {
  return {
    groups: library.groups.map((g) => ({
      id: g.id,
      name: g.name,
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
      })),
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
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
      })),
    })),
  };
}
