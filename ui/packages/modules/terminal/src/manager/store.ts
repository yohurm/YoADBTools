/**
 * 命令管理 store：草稿 + 选区。
 * 不依赖运行时终端 store；load / library 由 Dialog 注入。
 * 不开菜单、不写剪贴板、不查 DOM。
 */

import { createStore } from "solid-js/store";

import type { CommandLibraryDto } from "@yohu/api";
import { nextKeys, type SelectMode } from "@yohu/ui";

import {
  emptyBlock,
  emptyCommand,
  emptyGroup,
  emptyStep,
  fromDraft,
  nextDraftId,
  toDraft,
  type DraftCommand,
  type DraftEntry,
  type DraftGroup,
  type DraftState,
} from "../draft";
import { moveStep, moveStepTo } from "./reorder";

export function createCommandManagerStore() {
  const [draft, setDraft] = createStore<DraftState>({ groups: [] });
  const [ui, setUi] = createStore({
    selectedGroupId: null as string | null,
    selectedEntryIds: [] as string[],
    entryPivot: null as string | null,
    saving: false,
    error: "",
  });

  function selectedGroup(): DraftGroup | undefined {
    return draft.groups.find((g) => g.id === ui.selectedGroupId);
  }

  function selectedEntry(): DraftEntry | undefined {
    if (ui.selectedEntryIds.length !== 1) return undefined;
    return selectedGroup()?.entries.find((e) => e.id === ui.selectedEntryIds[0]);
  }

  function selectedCommands(): DraftCommand[] {
    const chosen = new Set(ui.selectedEntryIds);
    return (selectedGroup()?.entries ?? []).filter(
      (entry): entry is DraftCommand => chosen.has(entry.id) && entry.kind === "command",
    );
  }

  function selectedEntrySet(): Set<string> {
    return new Set(ui.selectedEntryIds);
  }

  function selectOnly(id: string | null): void {
    setUi("selectedEntryIds", id ? [id] : []);
    setUi("entryPivot", id);
  }

  function selectGroup(id: string): void {
    setUi("selectedGroupId", id);
    selectOnly(null);
  }

  function selectEntry(id: string, mode: SelectMode): void {
    const ordered = selectedGroup()?.entries.map((e) => e.id) ?? [];
    const next = nextKeys(ordered, new Set(ui.selectedEntryIds), ui.entryPivot, id, mode);
    setUi("selectedEntryIds", [...next.keys]);
    setUi("entryPivot", next.pivot);
  }

  function selectAllEntries(): void {
    const ids = selectedGroup()?.entries.map((e) => e.id) ?? [];
    setUi("selectedEntryIds", ids);
    setUi("entryPivot", ui.entryPivot ?? ids[0] ?? null);
  }

  function load(library: CommandLibraryDto): void {
    const snapshot = toDraft(library);
    setDraft({ groups: snapshot.groups });
    setUi({
      selectedGroupId: snapshot.groups[0]?.id ?? null,
      selectedEntryIds: [],
      entryPivot: null,
      saving: false,
      error: "",
    });
  }

  function library(): CommandLibraryDto {
    return fromDraft({ groups: draft.groups });
  }

  function setSaving(saving: boolean): void {
    setUi("saving", saving);
  }

  function setError(error: string): void {
    setUi("error", error);
  }

  function updateGroupName(id: string, name: string): void {
    setDraft("groups", (g) => g.id === id, "name", name);
  }

  function addGroup(): void {
    const id = nextDraftId("g");
    setDraft("groups", (groups) => [...groups, emptyGroup(id)]);
    setUi("selectedGroupId", id);
    selectOnly(null);
  }

  function removeGroup(): void {
    const gid = ui.selectedGroupId;
    if (!gid) return;
    setDraft("groups", (groups) => groups.filter((g) => g.id !== gid));
    const remaining = draft.groups.filter((g) => g.id !== gid);
    const next = remaining[0];
    setUi("selectedGroupId", next?.id ?? null);
    selectOnly(next?.entries[0]?.id ?? null);
  }

  function addCommand(): void {
    const gid = ui.selectedGroupId;
    if (!gid) return;
    const id = nextDraftId("c");
    setDraft("groups", (g) => g.id === gid, "entries", (es) => [...es, emptyCommand(id)]);
    selectOnly(id);
  }

  function addBlock(): void {
    const gid = ui.selectedGroupId;
    if (!gid) return;
    const id = nextDraftId("b");
    setDraft("groups", (g) => g.id === gid, "entries", (es) => [...es, emptyBlock(id, nextDraftId("s"))]);
    selectOnly(id);
  }

  function removeEntries(): void {
    const gid = ui.selectedGroupId;
    const ids = new Set(ui.selectedEntryIds);
    if (!gid || ids.size === 0) return;
    setDraft("groups", (g) => g.id === gid, "entries", (es) => es.filter((e) => !ids.has(e.id)));
    const remaining = selectedGroup()?.entries.filter((e) => !ids.has(e.id)) ?? [];
    selectOnly(remaining[0]?.id ?? null);
  }

  function updateEntry(patch: Partial<DraftEntry>): void {
    const gid = ui.selectedGroupId;
    const entry = selectedEntry();
    if (!gid || !entry) return;
    setDraft("groups", (g) => g.id === gid, "entries", (e) => e.id === entry.id, (current) => ({
      ...current,
      ...patch,
    }) as DraftEntry);
  }

  function updateBlockStep(stepId: string, template: string): void {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "block") return;
    updateEntry({
      steps: entry.steps.map((step) => (step.id === stepId ? { ...step, template } : step)),
    });
  }

  function addBlockStep(): void {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "block") return;
    updateEntry({ steps: [...entry.steps, emptyStep(nextDraftId("s"))] });
  }

  function removeBlockStep(stepId: string): void {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "block" || entry.steps.length <= 1) return;
    updateEntry({ steps: entry.steps.filter((step) => step.id !== stepId) });
  }

  function shiftBlockStep(index: number, delta: number): void {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "block") return;
    updateEntry({ steps: moveStep(entry.steps, index, delta) });
  }

  function moveBlockStepTo(from: number, to: number): void {
    const entry = selectedEntry();
    if (!entry || entry.kind !== "block") return;
    updateEntry({ steps: moveStepTo(entry.steps, from, to) });
  }

  return {
    draft,
    ui,
    load,
    library,
    selectedGroup,
    selectedEntry,
    selectedCommands,
    selectedEntrySet,
    selectGroup,
    selectEntry,
    selectAllEntries,
    selectOnly,
    setSaving,
    setError,
    updateGroupName,
    addGroup,
    removeGroup,
    addCommand,
    addBlock,
    removeEntries,
    updateEntry,
    updateBlockStep,
    addBlockStep,
    removeBlockStep,
    shiftBlockStep,
    moveBlockStepTo,
  };
}

export type CommandManagerStore = ReturnType<typeof createCommandManagerStore>;
