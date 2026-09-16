/**
 * 清单世代 / 浏览会话 / 路径提交 / 挂载期 fault。
 * 不订 transfer/progress，不持 TransferJob。
 */

import { createStore } from "solid-js/store";

import {
  filesCreate,
  filesDelete,
  filesList,
  filesMkdir,
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
import { resolveRemotePath } from "./path-resolve";

export type ListingReason = "bind" | "attach" | "user" | "mutate" | "transfer";

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
  let viewAttached = false;
  let transferListTimer: number | undefined;

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

  async function loadListing(
    target: string,
    stay: boolean,
    reason?: ListingReason,
  ): Promise<boolean> {
    cancelTransferListing();
    const current = serial();
    if (!current) {
      if (stay) setEntries([]);
      else notifyError("未选择设备");
      return false;
    }
    const gen = ++listGen;
    setSession("loading", true);
    try {
      const list = await filesList(current, target);
      if (gen !== listGen) return false;
      const moved = target !== session.path;
      if (moved) {
        setSession("path", target);
        clearSelection();
      }
      setEntries(sortEntries(list.map(listingEntryFromWire), sort.key, sort.dir));
      if (reason !== "mutate") notifyError("");
      YoLog.info("files", "浏览", { serial: current, path: target, count: list.length });
      if (!moved) {
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
      if (stay) setEntries([]);
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
        void loadListing(session.path, true, "transfer");
      }, TRANSFER_LISTING_MS);
      return true;
    }
    cancelTransferListing();
    return loadListing(session.path, true, reason);
  }

  /** 壳注入焦点。只在 serial 变化时 list；同设备新数组不扫盘。 */
  function bindSerial(next: string | null): void {
    const changed = next !== session.serial;
    setSession("serial", next);
    if (!next) {
      listGen += 1;
      cancelTransferListing();
      setEntries([]);
      clearFault();
      clearSelection();
      setSession("loading", false);
      viewAttached = false;
      return;
    }
    if (!changed) return;
    setSession("path", DEFAULT_BROWSE_ROOT);
    clearSelection();
    viewAttached = true;
    void requestListing("bind");
  }

  function attachView(): void {
    if (!session.serial || viewAttached) return;
    viewAttached = true;
    void requestListing("attach");
  }

  function detachView(): void {
    viewAttached = false;
    clearFault();
  }

  async function refresh(): Promise<boolean> {
    return requestListing("user");
  }

  async function navigate(target: string): Promise<boolean> {
    if (!target) return false;
    return loadListing(target, false);
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
    return navigate(resolved.path);
  }

  async function mutate(op: (serial: string) => Promise<void>, dropNames?: string[]): Promise<void> {
    const current = serial();
    if (!current) {
      notifyError("未选择设备");
      return;
    }
    if (dropNames && dropNames.length > 0) {
      const drop = new Set(dropNames);
      setEntries(entries.filter((entry) => !drop.has(entry.name)));
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
    setEntries(sortEntries(entries, key, dir));
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
