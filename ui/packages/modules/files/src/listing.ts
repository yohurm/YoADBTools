/**
 * 浏览会话：路径是身份，清单是按 serial+path 的快照。
 * 导航立刻切路径并画出缓存；files.list 只对账。不订 transfer/progress。
 */

import { createStore } from "solid-js/store";

import {
  filesCreate,
  filesDelete,
  filesList,
  filesMkdir,
  filesSessionAttach,
  filesSessionDetach,
  DEFAULT_BROWSE_ROOT,
  YoLog,
} from "@yohu/api";
import type { RemoteEntry } from "@yohu/api";
import {
  nextKeys,
  setColWidth as applyColWidth,
  type SelectMode,
} from "@yohu/ui";

import { filesFaultText, isCancelledError } from "./fault";
import {
  DEFAULT_SORT_DIR,
  FILE_COLUMNS,
  defaultFileColWidths,
  childPath,
  parentWithinSafety,
  sortEntries,
  type ListingEntry,
  type SortDir,
  type SortKey,
} from "./model";
import { listingCacheKey } from "./listing-paint";
import { resolveRemotePath } from "./path-resolve";

export type ListingReason = "bind" | "attach" | "user" | "mutate" | "transfer";
export type ListingCommit = "stay" | "now" | "on-ok";

/** 传输终态合并 list，不跟每张卡绑一次。 */
export const TRANSFER_LISTING_MS = 300;

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
  let coreGeneration = 0;
  let viewAttached = false;
  let transferListTimer: number | undefined;
  const dirCache = new Map<string, ListingEntry[]>();

  const serial = (): string | null => session.serial;

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

  function cancelTransferListing(): void {
    if (transferListTimer === undefined) return;
    window.clearTimeout(transferListTimer);
    transferListTimer = undefined;
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
    const current = serial();
    if (!current) {
      if (commit === "stay") {
        setEntries([]);
        setSession("cold", false);
      } else notifyError("未选择设备");
      return false;
    }
    if (coreGeneration === 0) {
      return false;
    }
    const gen = ++listGen;
    const pathBefore = session.path;
    const cached = snapshotOf(current, target);
    if (commit === "now" && target !== session.path) {
      setSession("path", target);
      clearSelection();
      paintSnapshot(cached);
      setSession("cold", false);
    } else if (commit === "stay" && (reason === "bind" || reason === "attach")) {
      if (cached) {
        paintSnapshot(cached);
        setSession("cold", false);
      } else {
        setEntries([]);
        setSession("cold", true);
      }
    } else {
      setSession("cold", false);
    }
    setSession("loading", true);
    try {
      const list = await filesList(current, target, coreGeneration);
      if (gen !== listGen) return false;
      const next = sortEntries(list.map(listingEntryFromWire), sort.key, sort.dir);
      remember(current, target, next);
      if (commit === "on-ok" && target !== session.path) {
        setSession("path", target);
        clearSelection();
      }
      setEntries(next);
      setSession("cold", false);
      if (reason !== "mutate") notifyError("");
      YoLog.info("files", "浏览", { serial: current, path: target, count: list.length });
      if (commit === "stay") {
        const alive = new Set(list.map((e) => e.name));
        setSelection("names", selection.names.filter((n) => alive.has(n)));
      }
      return true;
    } catch (e) {
      if (gen !== listGen) return false;
      if (isCancelledError(e)) return false;
      const message = filesFaultText(e);
      notifyError(message);
      YoLog.error("files", "浏览失败", { path: target, error: message });
      if (commit === "now" && target !== pathBefore) {
        setSession("path", pathBefore);
        clearSelection();
        paintSnapshot(snapshotOf(current, pathBefore));
      } else if (commit === "stay") {
        const keep = snapshotOf(current, session.path);
        if (keep) paintSnapshot(keep);
        else setEntries([]);
      }
      setSession("cold", false);
      return false;
    } finally {
      if (gen === listGen) setSession("loading", false);
    }
  }

  async function requestListing(reason: ListingReason): Promise<boolean> {
    if (reason === "transfer") {
      if (transferListTimer !== undefined) return true;
      transferListTimer = window.setTimeout(() => {
        transferListTimer = undefined;
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
      if (gen !== sessionGen) {
        detachCore(serial, attach.generation);
        return false;
      }
      coreGeneration = attach.generation;
      return true;
    } catch (e) {
      if (gen !== sessionGen) return false;
      notifyError(filesFaultText(e));
      YoLog.error("files", "浏览会话失败", { serial, error: filesFaultText(e) });
      return false;
    }
  }

  function detachCore(serial: string | null, generation: number): void {
    if (!serial || generation === 0) return;
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
      const prevGen = coreGeneration;
      sessionGen += 1;
      listGen += 1;
      cancelTransferListing();
      dirCache.clear();
      setEntries([]);
      clearFault();
      clearSelection();
      setSession("loading", false);
      setSession("cold", false);
      viewAttached = false;
      coreGeneration = 0;
      detachCore(prev, prevGen);
      return;
    }
    if (!changed) return;
    sessionGen += 1;
    listGen += 1;
    const gen = sessionGen;
    const prevGen = coreGeneration;
    coreGeneration = 0;
    cancelTransferListing();
    clearFault();
    if (prev) detachCore(prev, prevGen);
    dirCache.clear();
    setSession("path", DEFAULT_BROWSE_ROOT);
    setSession("cold", true);
    setSession("loading", true);
    clearSelection();
    viewAttached = true;
    void (async () => {
      if (!(await attachCore(next, gen))) {
        if (gen === sessionGen) {
          setSession("loading", false);
          setSession("cold", false);
        }
        return;
      }
      if (gen !== sessionGen) return;
      await requestListing("bind");
    })();
  }

  function attachView(): void {
    if (!session.serial || viewAttached) return;
    viewAttached = true;
    sessionGen += 1;
    const gen = sessionGen;
    const current = session.serial;
    void (async () => {
      if (!(await attachCore(current, gen))) return;
      if (gen !== sessionGen) return;
      await requestListing("attach");
    })();
  }

  function detachView(): void {
    viewAttached = false;
    sessionGen += 1;
    listGen += 1;
    cancelTransferListing();
    clearFault();
    detachCore(session.serial, coreGeneration);
    coreGeneration = 0;
  }

  async function refresh(): Promise<boolean> {
    return requestListing("user");
  }

  async function navigate(target: string): Promise<boolean> {
    if (!target) return false;
    return loadListing(target, "now");
  }

  async function enterDirectory(name: string): Promise<void> {
    await navigate(childPath(session.path, name));
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

  async function mutate(op: (serial: string) => Promise<void>, dropNames?: string[]): Promise<void> {
    const current = serial();
    if (!current) {
      notifyError("未选择设备");
      return;
    }
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
      await op(current);
      notifyError("");
    } catch (e) {
      notifyError(filesFaultText(e));
    } finally {
      setSession("mutating", false);
      await requestListing("mutate");
    }
  }

  async function removeMany(names: string[]): Promise<void> {
    const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (unique.length === 0) return;
    await mutate(async (current) => {
      const failures: string[] = [];
      for (const name of unique) {
        try {
          await filesDelete({ serial: current, path: childPath(session.path, name) });
        } catch (e) {
          failures.push(`${name}: ${filesFaultText(e)}`);
        }
      }
      if (failures.length > 0) throw new Error(failures.join("；"));
    }, unique);
  }

  async function mkdir(name: string): Promise<void> {
    await mutate(async (current) => {
      await filesMkdir({ serial: current, path: childPath(session.path, name.trim()) });
    });
  }

  async function createFile(name: string): Promise<void> {
    await mutate(async (current) => {
      await filesCreate({ serial: current, path: childPath(session.path, name.trim()) });
    });
  }

  function setSort(key: SortKey): void {
    const dir: SortDir = sort.key === key ? (sort.dir === "asc" ? "desc" : "asc") : DEFAULT_SORT_DIR[key];
    setSortState({ key, dir });
    const next = sortEntries(entries, key, dir);
    setEntries(next);
    const current = serial();
    if (current) remember(current, session.path, next);
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
    return selectedEntries().length === 1 && only?.kind === "file" ? only : undefined;
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
    select,
    selectAll,
    clearSelection,
    setColWidth,
    togglePreview,
    selectedSet,
    selectedEntries,
    singleFile,
    serial,
    notifyError,
    requestListing,
  };
}

export const listingStore = createListingStore();
