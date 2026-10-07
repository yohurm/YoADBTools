/**
 * 浏览会话：路径是身份，清单是按 serial+path 的快照。
 * 导航立刻切路径并画出缓存；files.list 只对账。不订 transfer/progress。
 */

import { createStore } from "solid-js/store";

import {
  selectedSerial,
  filesCreate,
  filesDelete,
  filesList,
  filesMkdir,
  filesSessionAttach,
  filesSessionDetach,
  DEFAULT_BROWSE_ROOT,
  entryIsFile,
  isCancelledError,
  parentWithinSafety,
  YoLog,
} from "@yohu/api";
import type { RemoteEntry } from "@yohu/api";
import {
  nextKeys,
  setColWidth as applyColWidth,
  trimmedTextPresent,
  type SelectMode,
} from "@yohu/ui";

import { caughtFaultLine, faultLine, filesFaultText, joinFaultLines } from "./fault";
import {
  DEFAULT_SORT_DIR,
  FILE_COLUMNS,
  defaultFileColWidths,
  childPath,
  entryOpensAsDir,
  sortDirIsAsc,
  sortEntries,
  type ChildPathResult,
  type ListingEntry,
  type SortDir,
  type SortKey,
} from "./model";
import { listingCacheKey } from "./listing-paint";
import { resolveRemotePath } from "./path-resolve";

export type ListingReason = "bind" | "attach" | "user" | "mutate" | "transfer";
export type ListingCommit = "stay" | "now" | "on-ok";

/** 成功或失败都留在当前路径。冷启动、选区修剪和失败回放都认这一把。 */
export function listingCommitStays(commit: ListingCommit): boolean {
  return commit === "stay";
}

/** 请求一开始就改地址，失败再退回。 */
export function listingCommitNow(commit: ListingCommit): boolean {
  return commit === "now";
}

/** 传输终态合并 list，不跟每张卡绑一次。 */
export const TRANSFER_LISTING_MS = 300;

/** 还没有浏览世代。拉清单、卸会话、拖出都问这里。 */
export function browseGenerationAbsent(generation: number): boolean {
  return generation === 0;
}

export function listingEntryFromWire(entry: RemoteEntry): ListingEntry {
  return {
    name: entry.name,
    kind: entry.kind,
    size: entry.size,
    permission: entry.permission,
    mtime: entry.mtime ?? "",
  };
}

export function createListingStore() {
  const [entries, setEntries] = createStore<ListingEntry[]>([]);
  const [session, setSession] = createStore({
    serial: null as string | null,
    path: DEFAULT_BROWSE_ROOT as string,
    loading: false,
    /** 无快照的首次绑定才全屏 loading；进目录不是 cold。 */
    cold: false,
    mutating: false,
    error: "",
    errorTick: 0,
  });
  const [sort, setSortState] = createStore<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });
  const [selection, setSelection] = createStore({
    names: [] as string[],
    pivot: null as string | null,
  });
  const [ui, setUi] = createStore({
    previewOpen: false,
    colWidths: defaultFileColWidths(),
  });

  let listGen = 0;
  let sessionGen = 0;
  /** core `BrowseAttach.generation`；0 = 未 attach。与 sessionGen（视图世代）独立。 */
  let coreGeneration: number;
  let viewAttached: boolean;
  let transferListTimer: number | undefined;
  const dirCache = new Map<string, ListingEntry[]>();

  const serial = (): string | null => session.serial;
  const generation = (): number => coreGeneration;

  function markWarm(): void {
    setSession("cold", false);
  }

  function markCold(): void {
    setSession("cold", true);
  }

  function markIdle(): void {
    setSession("loading", false);
  }

  function markBusy(): void {
    setSession("loading", true);
  }

  function clearEntries(): void {
    setEntries([]);
  }

  function bumpSessionGen(): void {
    sessionGen += 1;
  }

  function bumpListGen(): void {
    listGen += 1;
  }

  function clearCoreGeneration(): void {
    coreGeneration = 0;
  }

  function sessionGenStale(gen: number): boolean {
    return gen !== sessionGen;
  }

  function listGenStale(gen: number): boolean {
    return gen !== listGen;
  }

  function clearDirCache(): void {
    dirCache.clear();
  }

  function pickedSerial(): ReturnType<typeof selectedSerial> {
    return selectedSerial(serial());
  }

  function markViewDetached(): void {
    viewAttached = false;
  }

  function markViewAttached(): void {
    viewAttached = true;
  }

  function showTargetPath(target: string): void {
    setSession("path", target);
  }

  function childAt(name: string): ChildPathResult {
    return childPath(session.path, name);
  }

  function showEntries(next: ListingEntry[]): void {
    setEntries(next);
  }

  function forgetTransferTimer(): void {
    transferListTimer = undefined;
  }

  function paintCached(cached: ListingEntry[] | undefined): void {
    paintSnapshot(cached);
  }

  function readSessionGen(): number {
    const gen = sessionGen;
    return gen;
  }

  function readCoreGeneration(): number {
    const prevGen = coreGeneration;
    return prevGen;
  }

  function clearListedError(): void {
    notifyError("");
  }

  function selectionNames(): string[] {
    return listingStore.selection.names;
  }

  function childPathRejected(child: ChildPathResult): child is Extract<ChildPathResult, { ok: false }> {
    return !child.ok;
  }

  function pickRejected(
    picked: { ok: true; serial: string } | { ok: false; reason: string },
  ): picked is { ok: false; reason: string } {
    return !picked.ok;
  }

  markViewDetached();
  clearCoreGeneration();

  function clearSelection(): void {
    setSelection({ names: [], pivot: null });
  }

  function clearFault(): void {
    setSession("error", "");
    setSession("errorTick", 0);
  }

  function notifyError(message: string): void {
    setSession("error", message);
    if (message && viewAttached) setSession("errorTick", session.errorTick + 1);
  }

  function notifyCaught(e: unknown): string {
    const message = filesFaultText(e);
    notifyError(message);
    return message;
  }

  function cancelTransferListing(): void {
    if (transferListTimer === undefined) return;
    window.clearTimeout(transferListTimer);
    forgetTransferTimer();
  }

  function snapshotOf(serial: string, path: string): ListingEntry[] | undefined {
    return dirCache.get(listingCacheKey(serial, path));
  }

  function remember(serial: string, path: string, list: ListingEntry[]): void {
    dirCache.set(listingCacheKey(serial, path), list);
  }

  function paintSnapshot(list: ListingEntry[] | undefined): void {
    setEntries(list ? list.slice() : []);
  }

  async function loadListing(
    target: string,
    commit: ListingCommit,
    reason?: ListingReason,
  ): Promise<boolean> {
    cancelTransferListing();
    const picked = pickedSerial();
    if (pickRejected(picked)) {
      if (listingCommitStays(commit)) {
        clearEntries();
        markWarm();
      } else notifyError(picked.reason);
      return false;
    }
    const current = picked.serial;
    if (browseGenerationAbsent(coreGeneration)) {
      return false;
    }
    const gen = ++listGen;
    const pathBefore = session.path;
    const cached = snapshotOf(current, target);
    if (listingCommitNow(commit) && target !== session.path) {
      showTargetPath(target);
      clearSelection();
      paintCached(cached);
      markWarm();
    } else if (listingCommitStays(commit) && (reason === "bind" || reason === "attach")) {
      if (cached) {
        paintCached(cached);
        markWarm();
      } else {
        clearEntries();
        markCold();
      }
    } else {
      markWarm();
    }
    markBusy();
    try {
      const list = await filesList(current, target, coreGeneration);
      if (listGenStale(gen)) return false;
      const next = sortEntries(list.map(listingEntryFromWire), sort.key, sort.dir);
      remember(current, target, next);
      if (commit === "on-ok" && target !== session.path) {
        showTargetPath(target);
        clearSelection();
      }
      showEntries(next);
      markWarm();
      if (reason !== "mutate") clearListedError();
      YoLog.info("files", "浏览", { serial: current, path: target, count: list.length });
      if (listingCommitStays(commit)) {
        const alive = new Set(list.map((e) => e.name));
        setSelection("names", selection.names.filter((n) => alive.has(n)));
      }
      return true;
    } catch (e) {
      if (listGenStale(gen)) return false;
      if (isCancelledError(e)) return false;
      const message = notifyCaught(e);
      YoLog.error("files", "浏览失败", { path: target, error: message });
      if (listingCommitNow(commit) && target !== pathBefore) {
        setSession("path", pathBefore);
        clearSelection();
        paintSnapshot(snapshotOf(current, pathBefore));
      } else if (listingCommitStays(commit)) {
        const keep = snapshotOf(current, session.path);
        if (keep) paintSnapshot(keep);
        else clearEntries();
      }
      markWarm();
      return false;
    } finally {
      if (gen === listGen) markIdle();
    }
  }

  async function requestListing(reason: ListingReason): Promise<boolean> {
    if (reason === "transfer") {
      if (transferListTimer !== undefined) return true;
      transferListTimer = window.setTimeout(() => {
        forgetTransferTimer();
        void loadListing(session.path, "stay", "transfer");
      }, TRANSFER_LISTING_MS);
      return true;
    }
    cancelTransferListing();
    return loadListing(session.path, "stay", reason);
  }

  async function attachCore(serial: string, gen: number): Promise<boolean> {
    try {
      const attach = await filesSessionAttach(serial);
      if (sessionGenStale(gen)) {
        detachCore(serial, attach.generation);
        return false;
      }
      coreGeneration = attach.generation;
      return true;
    } catch (e) {
      if (sessionGenStale(gen)) return false;
      const message = notifyCaught(e);
      YoLog.error("files", "浏览会话失败", { serial, error: message });
      return false;
    }
  }

  function detachCore(serial: string | null, generation: number): void {
    if (!serial || browseGenerationAbsent(generation)) return;
    void filesSessionDetach(serial, generation).catch((e) => {
      YoLog.warn("files", "关闭浏览会话失败", { serial, error: filesFaultText(e) });
    });
  }

  /** 壳注入焦点。只在 serial 变化时 list；同设备新数组不扫盘。 */
  function bindSerial(next: string | null): void {
    const prev = session.serial;
    const changed = next !== prev;
    setSession("serial", next);
    if (!next) {
      const prevGen = readCoreGeneration();
      bumpSessionGen();
      bumpListGen();
      cancelTransferListing();
      clearDirCache();
      clearEntries();
      clearFault();
      clearSelection();
      markIdle();
      markWarm();
      markViewDetached();
      clearCoreGeneration();
      detachCore(prev, prevGen);
      return;
    }
    if (!changed) return;
    bumpSessionGen();
    bumpListGen();
    const gen = readSessionGen();
    const prevGen = readCoreGeneration();
    clearCoreGeneration();
    cancelTransferListing();
    clearFault();
    if (prev) detachCore(prev, prevGen);
    clearDirCache();
    setSession("path", DEFAULT_BROWSE_ROOT);
    markCold();
    markBusy();
    clearSelection();
    markViewAttached();
    void (async () => {
      if (!(await attachCore(next, gen))) {
        if (gen === sessionGen) {
          markIdle();
          markWarm();
        }
        return;
      }
      if (sessionGenStale(gen)) return;
      await requestListing("bind");
    })();
  }

  function attachView(): void {
    if (!session.serial || viewAttached) return;
    markViewAttached();
    bumpSessionGen();
    const gen = readSessionGen();
    const current = session.serial;
    void (async () => {
      if (!(await attachCore(current, gen))) return;
      if (sessionGenStale(gen)) return;
      await requestListing("attach");
    })();
  }

  function detachView(): void {
    markViewDetached();
    bumpSessionGen();
    bumpListGen();
    cancelTransferListing();
    clearFault();
    detachCore(session.serial, coreGeneration);
    clearCoreGeneration();
  }

  async function refresh(): Promise<boolean> {
    return requestListing("user");
  }

  async function navigate(target: string): Promise<boolean> {
    if (!target) return false;
    return loadListing(target, "now");
  }

  async function enterDirectory(name: string): Promise<void> {
    const found = entries.find((item) => item.name === name);
    if (!found || !entryOpensAsDir(found.kind)) return;
    const child = childAt(name);
    if (childPathRejected(child)) {
      notifyError(child.reason);
      return;
    }
    await navigate(child.path);
  }

  async function goUp(): Promise<void> {
    const parent = parentWithinSafety(session.path);
    if (parent !== null) await navigate(parent);
  }

  async function goTo(target: string): Promise<boolean> {
    const resolved = resolveRemotePath(target, session.path);
    if (!resolved.ok) {
      notifyError(resolved.reason);
      return false;
    }
    return loadListing(resolved.path, "on-ok");
  }

  async function mutate(op: (serial: string) => Promise<void | string>, dropNames?: string[]): Promise<void> {
    const picked = pickedSerial();
    if (pickRejected(picked)) {
      notifyError(picked.reason);
      return;
    }
    const current = picked.serial;
    if (dropNames && dropNames.length > 0) {
      const drop = new Set(dropNames);
      const kept = entries.filter((entry) => !drop.has(entry.name));
      setEntries(kept);
      const currentSerial = serial();
      if (currentSerial) remember(currentSerial, session.path, kept);
      setSelection("names", selection.names.filter((name) => !drop.has(name)));
    }
    setSession("mutating", true);
    try {
      const fault = await op(current);
      notifyError(fault ?? "");
    } catch (e) {
      notifyCaught(e);
    } finally {
      setSession("mutating", false);
      await requestListing("mutate");
    }
  }

  async function removeMany(names: string[]): Promise<void> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(trimmedTextPresent))];
    if (unique.length === 0) return;
    await mutate(async (current) => {
      const failures: string[] = [];
      for (const name of unique) {
        const child = childAt(name);
        if (childPathRejected(child)) {
          failures.push(faultLine(name, child.reason));
          continue;
        }
        try {
          await filesDelete({ serial: current, path: child.path });
        } catch (e) {
          failures.push(caughtFaultLine(name, e));
        }
      }
      return joinFaultLines(failures);
    }, unique);
  }

  async function mutateNewEntry(
    name: string,
    write: (serial: string, path: string) => Promise<void>,
  ): Promise<void> {
    await mutate(async (current) => {
      const child = childPath(session.path, name.trim());
      if (childPathRejected(child)) return child.reason;
      await write(current, child.path);
    });
  }

  async function mkdir(name: string): Promise<void> {
    await mutateNewEntry(name, (serial, path) => filesMkdir({ serial, path }));
  }

  async function createFile(name: string): Promise<void> {
    await mutateNewEntry(name, (serial, path) => filesCreate({ serial, path }));
  }

  function setSort(key: SortKey): void {
    const dir: SortDir = sort.key === key ? (sortDirIsAsc(sort.dir) ? "desc" : "asc") : DEFAULT_SORT_DIR[key];
    setSortState({ key, dir });
    const next = sortEntries(entries, key, dir);
    showEntries(next);
    const current = serial();
    if (current) remember(current, session.path, next);
  }

  /** 拖出和行上菜单：这一行已在选择里就保持整组，否则换成这一行。 */
  function selectGestureTarget(name: string): void {
    if (selectedSet().has(name)) return;
    select(name, "replace");
  }

  function select(name: string, mode: SelectMode): void {
    const ordered = entries.map((entry) => entry.name);
    const next = nextKeys(ordered, new Set(selection.names), selection.pivot, name, mode);
    setSelection({ names: [...next.keys], pivot: next.pivot });
  }

  function selectAll(): void {
    const names = entries.map((entry) => entry.name);
    setSelection({ names, pivot: selection.pivot ?? names[0] ?? null });
  }

  function setColWidth(key: SortKey, width: number): void {
    const spec = FILE_COLUMNS.find((col) => col.key === key);
    if (!spec) return;
    setUi("colWidths", applyColWidth(ui.colWidths, spec, width));
  }

  function togglePreview(): void {
    setUi("previewOpen", (v) => !v);
  }

  let selectedCache: { names: string[]; set: Set<string> } | null = null;
  const selectedSet = (): Set<string> => {
    const names = selection.names;
    if (selectedCache && selectedCache.names === names) return selectedCache.set;
    const set = new Set(names);
    selectedCache = { names, set };
    return set;
  };

  const selectedEntries = (): ListingEntry[] => entries.filter((e) => selection.names.includes(e.name));

  const singleFile = (): ListingEntry | undefined => {
    const only = selectedEntries()[0];
    return selectedEntries().length === 1 && only && entryIsFile(only.kind) ? only : undefined;
  };

  return {
    entries,
    session,
    sort,
    selection,
    ui,
    bindSerial,
    attachView,
    detachView,
    refresh,
    navigate,
    enterDirectory,
    goUp,
    goTo,
    removeMany,
    mkdir,
    createFile,
    setSort,
    selectGestureTarget,
    select,
    selectAll,
    clearSelection,
    setColWidth,
    togglePreview,
    selectedSet,
    selectedEntries,
    singleFile,
    serial,
    generation,
    notifyError,
    notifyCaught,
    requestListing,
    clearListedError,
    selectionNames,
    childPathRejected,
    pickRejected,
  };
}

export const listingStore = createListingStore();
