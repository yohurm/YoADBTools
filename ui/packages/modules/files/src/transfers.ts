/**
 * TransferJob 寿命：发号、progress、淡出、push/pull/cancel/dismiss/dragOut。
 * 读 listingStore.serial/path；终态只调 requestListing("transfer")。
 */

import { createStore } from "solid-js/store";

import {
  filesCancel,
  filesDragOut,
  filesPull,
  filesPush,
  onTransferProgress,
} from "@yohu/api";
import type { DragOutItem, TransferProgress } from "@yohu/api";
import { DISMISS_HOLD_DURATION, motionDurationMs } from "@yohu/ui";

import { localBaseName, namesForDrag } from "./drop";
import { filesFaultText, isNotFoundError } from "./fault";
import { listingStore } from "./listing";
import { childPath, validateEntryName } from "./model";
import {
  applyProgressToJob,
  createTransferJob,
  resolveJobName,
  shouldAcceptProgress,
  transferFallbackName,
  type TransferJob,
} from "./transfer-model";

const TERMINAL_KEEP_MS = motionDurationMs(DISMISS_HOLD_DURATION);

function dragItems(names: readonly string[]): DragOutItem[] {
  const dir = listingStore.session.path;
  const byName = new Map(listingStore.entries.map((entry) => [entry.name, entry]));
  return names.flatMap((name) => {
    const entry = byName.get(name);
    if (!entry) return [];
    return [
      {
        remote: childPath(dir, name),
        is_dir: entry.kind === "dir",
        size: entry.size,
      },
    ];
  });
}

export function createTransferStore() {
  const [transfers, setTransfers] = createStore<TransferJob[]>([]);

  const speedBase = new Map<number, { bytes: number; ts: number }>();
  const fadeTimers = new Map<number, number>();
  const dismissed = new Set<number>();

  function adoptJob(job: TransferJob): void {
    if (dismissed.has(job.id)) return;
    const index = transfers.findIndex((item) => item.id === job.id);
    if (index < 0) {
      setTransfers((ts) => [...ts, job]);
      return;
    }
    const current = transfers[index];
    if (!current) return;
    setTransfers(index, {
      name: resolveJobName(job.name, current.name, job.name),
      total: current.total ?? job.total,
    });
  }

  function upsertTransfer(progress: TransferProgress): void {
    if (dismissed.has(progress.id)) return;
    const existing = transfers.find((t) => t.id === progress.id);
    if (!shouldAcceptProgress(existing?.state, progress.state)) return;
    const now = Date.now();
    const base = speedBase.get(progress.id);
    const speed =
      base !== undefined && now > base.ts
        ? Math.max(0, Math.round(((progress.bytes - base.bytes) / (now - base.ts)) * 1000))
        : undefined;
    speedBase.set(progress.id, { bytes: progress.bytes, ts: now });
    const index = transfers.findIndex((t) => t.id === progress.id);
    if (index < 0 || !existing) {
      const born = createTransferJob({
        id: progress.id,
        direction: progress.direction,
        name: resolveJobName(progress.name, undefined, transferFallbackName(progress.direction, progress.id)),
        total: progress.total,
      });
      setTransfers((ts) => [...ts, applyProgressToJob(born, progress, speed)]);
    } else {
      setTransfers(index, applyProgressToJob(existing, progress, speed));
    }
    if (progress.state !== "running") {
      speedBase.delete(progress.id);
      const prev = fadeTimers.get(progress.id);
      if (prev !== undefined) window.clearTimeout(prev);
      fadeTimers.set(
        progress.id,
        window.setTimeout(() => {
          fadeTimers.delete(progress.id);
          dismissed.add(progress.id);
          setTransfers((ts) => ts.filter((t) => t.id !== progress.id));
        }, TERMINAL_KEEP_MS),
      );
    }
  }

  async function enqueuePush(local: string, remoteName: string, destDir: string): Promise<void> {
    const current = listingStore.serial();
    if (!current) throw new Error("未选择设备");
    const remote = childPath(destDir, remoteName);
    const id = await filesPush({ serial: current, local, remote });
    adoptJob(createTransferJob({ id, direction: "push", name: remoteName }));
  }

  async function push(local: string, remoteName: string, destDir?: string): Promise<void> {
    try {
      await enqueuePush(local, remoteName, destDir ?? listingStore.session.path);
      listingStore.notifyError("");
    } catch (e) {
      listingStore.notifyError(filesFaultText(e));
    }
  }

  async function pushLocals(locals: string[], destDir?: string): Promise<void> {
    if (!listingStore.serial()) {
      listingStore.notifyError("未选择设备");
      return;
    }
    const dest = destDir ?? listingStore.session.path;
    const failures: string[] = [];
    for (const local of locals) {
      const name = localBaseName(local);
      const invalid = validateEntryName(name);
      if (invalid) {
        failures.push(`${name || local}: ${invalid}`);
        continue;
      }
      try {
        await enqueuePush(local, name, dest);
      } catch (e) {
        failures.push(`${name}: ${filesFaultText(e)}`);
      }
    }
    listingStore.notifyError(failures.length > 0 ? failures.join("；") : "");
  }

  async function pull(remoteName: string, local: string, expectedBytes?: number): Promise<void> {
    const current = listingStore.serial();
    if (!current) {
      listingStore.notifyError("未选择设备");
      return;
    }
    try {
      const remote = childPath(listingStore.session.path, remoteName);
      const id = await filesPull({
        serial: current,
        local,
        remote,
        expected_bytes: expectedBytes && expectedBytes > 0 ? expectedBytes : undefined,
      });
      adoptJob(
        createTransferJob({
          id,
          direction: "pull",
          name: remoteName,
          total: expectedBytes && expectedBytes > 0 ? expectedBytes : undefined,
        }),
      );
      listingStore.notifyError("");
    } catch (e) {
      listingStore.notifyError(filesFaultText(e));
    }
  }

  async function cancel(id: number): Promise<void> {
    try {
      await filesCancel(id);
    } catch (e) {
      if (!isNotFoundError(e)) {
        listingStore.notifyError(filesFaultText(e));
        return;
      }
    }
    const current = transfers.find((t) => t.id === id);
    if (current?.state === "running") {
      upsertTransfer({
        id,
        direction: current.direction,
        bytes: current.bytes,
        total: current.total,
        state: "cancelled",
        name: current.name,
      });
    }
    listingStore.notifyError("");
  }

  let dragging = false;

  async function dragOut(dragName: string): Promise<void> {
    const current = listingStore.serial();
    const generation = listingStore.generation();
    if (!current || dragging) return;
    const names = namesForDrag(listingStore.selection.names, dragName);
    if (names.length === 0) return;
    if (generation === 0) return;
    const items = dragItems(names);
    if (items.length === 0) return;
    dragging = true;
    try {
      await filesDragOut({ serial: current, generation, items });
      listingStore.notifyError("");
    } catch (e) {
      listingStore.notifyError(filesFaultText(e));
    } finally {
      dragging = false;
    }
  }

  function dismiss(id: number): void {
    dismissed.add(id);
    const prev = fadeTimers.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
    fadeTimers.delete(id);
    speedBase.delete(id);
    const current = transfers.find((item) => item.id === id);
    setTransfers((ts) => ts.filter((item) => item.id !== id));
    if (current?.state === "running") {
      void filesCancel(id).catch((e) => {
        if (!isNotFoundError(e)) listingStore.notifyError(filesFaultText(e));
      });
    }
  }

  void onTransferProgress((e) => {
    upsertTransfer({ ...e });
    if (e.state !== "running" && listingStore.serial()) void listingStore.requestListing("transfer");
  });

  return {
    transfers,
    push,
    pushLocals,
    pull,
    cancel,
    dismiss,
    dragOut,
  };
}

export const transferStore = createTransferStore();
