/**
 * 命令管理 store：草稿 + 选区 + 开窗旗标。
 * 模块会话单例；不依赖运行时终端 store。
 * 不开菜单、不写剪贴板、不查 DOM。
 *
 * 设计后链路（换位）：
 *   定高组/条目 YoVirtualList.onReorder → moveGroupTo / moveEntryTo
 *   变高步骤 YoReorderList.onReorder（及 Ctrl/Meta+↑/↓）→ moveBlockStepTo
 *   三者都只调 @yohu/ui moveItemTo。禁止 shift 包装、禁止第二套几何。
 *   多选迁到其他组：moveEntriesTo。气泡飞行在 MigrateLayer，这里只改草稿，放下后清空条目选区。
 * 设计后链路（占位符）：
 *   `{n}` 只活在一条模板上。命令改 template / params；块改该步 template / params。
 *   块填参身份是 (step, index)，标签 `1-0`。禁止条目级并集。
 */

import { createStore } from "solid-js/store";

import type { CommandLibraryDto, CommandParamDto } from "@yohu/api";
import { moveItemTo, nextKeys, type SelectMode } from "@yohu/ui";

import { entryIsBlock, entryIsCommand } from "@yohu/api";
import { moveEntriesIntoGroup } from "./migrate";
import {
  emptyBlock,
  emptyCommand,
  emptyGroup,
  emptyStep,
  fromDraft,
  nextDraftId,
  toDraft,
  type DraftBlock,
  type DraftCommand,
  type DraftEntry,
  type DraftGroup,
  type DraftState,
} from "../draft";

export function createCommandManagerStore() {
  const [draft, setDraft] = createStore<DraftState>({ groups: [] });
  const [ui, setUi] = createStore({
    open: false,
    selectedGroupId: null as string | null,
    selectedEntryIds: [] as string[],
    entryPivot: null as string | null,
    saving: false,
    error: "",
  });

  function groupId(): string | null {
    return ui.selectedGroupId;
  }

  function groupIs(g: { id: string }, id: string): boolean {
    return g.id === id;
  }

  function selectedGroup(): DraftGroup | undefined {
    const id = groupId();
    if (!id) return undefined;
    return draft.groups.find((g) => groupIs(g, id));
  }

  function selectedEntrySet(): Set<string> {
    return new Set(ui.selectedEntryIds);
  }

  function selectedEntry(): DraftEntry | undefined {
    const ids = [...selectedEntrySet()];
    if (ids.length !== 1) return undefined;
    return selectedEntries().find((e) => e.id === ids[0]);
  }

  function selectedBlock(): DraftBlock | undefined {
    const entry = selectedEntry();
    if (!entry || !entryIsBlock(entry)) return undefined;
    return entry;
  }

  const selectedEntries = (): DraftEntry[] => selectedGroup()?.entries ?? [];

  function selectedCommands(): DraftCommand[] {
    const chosen = selectedEntrySet();
    return selectedEntries().filter(
      (entry): entry is DraftCommand => chosen.has(entry.id) && entryIsCommand(entry),
    );
  }

  function writeSelection(ids: string[], pivot: string | null): void {
    setUi("selectedEntryIds", ids);
    setUi("entryPivot", pivot);
  }

  function selectOnly(id: string | null): void {
    writeSelection(id ? [id] : [], id);
  }

  function selectGroup(id: string): void {
    setUi("selectedGroupId", id);
    selectOnly(null);
  }

  function groupEntryIds(): string[] {
    const entries = selectedEntries();
    return entries.map((e) => e.id);
  }

  function selectEntry(id: string, mode: SelectMode): void {
    const ordered = groupEntryIds();
    const next = nextKeys(ordered, selectedEntrySet(), ui.entryPivot, id, mode);
    writeSelection([...next.keys], next.pivot);
  }

  function selectAllEntries(): void {
    const ids = groupEntryIds();
    writeSelection(ids, ui.entryPivot ?? ids[0] ?? null);
  }

  function replaceEditorUi(selectedGroupId: string | null): void {
    setUi({
      selectedGroupId,
      selectedEntryIds: [],
      entryPivot: null,
      saving: false,
      error: "",
    });
  }

  function idOrNull(id: string | undefined): string | null {
    return id ?? null;
  }

  function load(library: CommandLibraryDto): void {
    const snapshot = toDraft(library);
    setDraft({ groups: snapshot.groups });
    replaceEditorUi(idOrNull(snapshot.groups[0]?.id));
  }

  /** 从关闭到打开才切库快照；已打开再调用不覆盖草稿。 */
  function open(library: CommandLibraryDto): void {
    if (ui.open) return;
    load(library);
    setUi("open", true);
  }

  /** 页脚取消 / 关窗：只关 open。载荷等出场完成再丢。 */
  function requestClose(): void {
    setUi("open", false);
  }

  /** Dialog 出场完成：丢草稿、清选区/error。下次 open 才再切库。 */
  function finishClose(): void {
    setDraft({ groups: [] });
    replaceEditorUi(null);
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
    setDraft("groups", (g) => groupIs(g, id), "name", name);
  }

  function addGroup(): void {
    const id = nextDraftId("g");
    setDraft("groups", (groups) => [...groups, emptyGroup(id)]);
    selectGroup(id);
  }

  function moveGroupTo(from: number, to: number): void {
    setDraft("groups", (groups) => moveItemTo(groups, from, to));
  }

  function removeGroup(): void {
    const gid = groupId();
    if (!gid) return;
    const remaining = draft.groups.filter((g) => g.id !== gid);
    setDraft("groups", remaining);
    const next = remaining[0];
    setUi("selectedGroupId", idOrNull(next?.id));
    selectOnly(idOrNull(next?.entries[0]?.id));
  }

  function writeGroupEntries(
    next: DraftEntry[] | ((entries: DraftEntry[]) => DraftEntry[]),
  ): boolean {
    const gid = groupId();
    if (!gid) return false;
    setDraft("groups", (g) => groupIs(g, gid), "entries", next);
    return true;
  }

  function appendEntry(entry: DraftEntry): void {
    if (!writeGroupEntries((es) => [...es, entry])) return;
    selectOnly(entry.id);
  }

  function addCommand(): void {
    const id = nextDraftId("c");
    appendEntry(emptyCommand(id));
  }

  function addBlock(): void {
    const id = nextDraftId("b");
    appendEntry(emptyBlock(id, nextDraftId("s")));
  }

  function moveEntryTo(from: number, to: number): void {
    writeGroupEntries((entries) => moveItemTo(entries, from, to));
  }

  /** 当前选区按清单顺序追加到目标组。放下后不再保持选中。迁不动则原样。 */
  function moveEntriesTo(targetId: string): boolean {
    const gid = groupId();
    if (!gid) return false;
    const moved = moveEntriesIntoGroup(draft.groups, gid, selectedEntrySet(), targetId);
    if (!moved) return false;
    setDraft("groups", moved.groups);
    selectGroup(targetId);
    return true;
  }

  function removeEntries(): void {
    const ids = selectedEntrySet();
    if (ids.size === 0) return;
    const remaining = selectedEntries().filter((e) => !ids.has(e.id));
    if (!writeGroupEntries(remaining)) return;
    selectOnly(idOrNull(remaining[0]?.id));
  }

  function setEntryName(name: string): void {
    updateEntry({ name });
  }

  function updateEntry(patch: Partial<DraftEntry>): void {
    const gid = groupId();
    const entry = selectedEntry();
    if (!gid || !entry) return;
    setDraft("groups", (g) => groupIs(g, gid), "entries", (e) => e.id === entry.id, (current) => ({
      ...current,
      ...patch,
    }) as DraftEntry);
  }

  function writeBlockSteps(edit: (steps: DraftBlock["steps"]) => DraftBlock["steps"]): void {
    const entry = selectedBlock();
    if (!entry) return;
    updateEntry({ steps: edit(entry.steps) });
  }

  function patchBlockStep(stepId: string, patch: { template?: string; params?: CommandParamDto[] }): void {
    writeBlockSteps((steps) => steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)));
  }

  function updateBlockStep(stepId: string, template: string): void {
    patchBlockStep(stepId, { template });
  }

  function updateBlockStepParams(stepId: string, params: CommandParamDto[]): void {
    patchBlockStep(stepId, { params });
  }

  function addBlockStep(): void {
    writeBlockSteps((steps) => [...steps, emptyStep(nextDraftId("s"))]);
  }

  /** 当前块多于一步才可删。按钮禁用和删除都认这一把。 */
  function canRemoveBlockStep(): boolean {
    const entry = selectedBlock();
    return entry !== undefined && entry.steps.length > 1;
  }

  function removeBlockStep(stepId: string): void {
    if (!canRemoveBlockStep()) return;
    writeBlockSteps((steps) => steps.filter((step) => step.id !== stepId));
  }

  function moveBlockStepTo(from: number, to: number): void {
    writeBlockSteps((steps) => moveItemTo(steps, from, to));
  }

  return {
    draft,
    ui,
    load,
    open,
    requestClose,
    finishClose,
    library,
    selectedGroup,
    selectedEntries,
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
    moveGroupTo,
    removeGroup,
    addCommand,
    addBlock,
    moveEntryTo,
    moveEntriesTo,
    removeEntries,
    setEntryName,
    updateEntry,
    updateBlockStep,
    updateBlockStepParams,
    addBlockStep,
    canRemoveBlockStep,
    removeBlockStep,
    moveBlockStepTo,
  };
}

export type CommandManagerStore = ReturnType<typeof createCommandManagerStore>;

export const commandManagerStore = createCommandManagerStore();
