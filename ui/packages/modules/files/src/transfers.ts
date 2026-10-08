/**
 * TransferJob 寿命：发号、progress、淡出、push/pull/cancel/dismiss/dragOut。
 * 读 listingStore.serial/path；终态只调 requestListing("transfer")。
 */

import { createStore } from "solid-js/store";

import {
  selectedSerial,
  entryIsDir,
  filesCancel,
  filesDragOut,
  filesPull,
  filesPush,
  hostBaseName,
  isTerminalTransfer,
  onTransferProgress,
  transferIsRunning,
} from "@yohu/api";
import type { DragOutItem, TransferProgress } from "@yohu/api";
import { DISMISS_HOLD_DURATION, motionDurationMs } from "@yohu/ui";

import { namesForDrag } from "./drop";
import { caughtFaultLine, faultLine, isNotFoundError, joinFaultLines } from "./fault";
import { browseGenerationAbsent, listingStore } from "./listing";
import { childPath } from "./model";
import {
  applyProgressToJob,
  createTransferJob,
  resolveJobName,
  shouldAcceptProgress,
  transferFallbackName,
  transferKnownTotal,
  type TransferJob,
} from "./transfer-model";

const TERMINAL_KEEP_MS = motionDurationMs(DISMISS_HOLD_DURATION);

function dragItems(names: readonly string[]): { ok: true; items: DragOutItem[] } | { ok: false; reason: string } {
  const dir = listingStore.session.path;
  const byName = new Map(listingStore.entries.map((entry) => [entry.name, entry]));
  const items: DragOutItem[] = [];
  for (const name of names) {
    const entry = byName.get(name);
    if (!entry) continue;
    const child = childPath(dir, name);
    if (listingStore.childPathRejected(child)) return child;
    items.push({
      remote: child.path,
      is_dir: entryIsDir(entry.kind),
      size: entry.size,
    });
  }
  return { ok: true, items };
}

function pushDest(destDir?: string): string {
  return destDir ?? listingStore.session.path;
}

export function createTransferStore() {
  const [transfers, setTransfers] = createStore<TransferJob[]>([]);

  const speedBase = new Map<number, { bytes: number; ts: number }>();
  const fadeTimers = new Map<number, number>();
  const dismissed = new Set<number>();

  function pickedTransferSerial(): ReturnType<typeof selectedSerial> {
    return selectedSerial(listingStore.serial());
  }

  function clearScheduledFade(id: number): void {
    const prev = fadeTimers.get(id);
    if (prev !== undefined) window.clearTimeout(prev);
  }

  function markDismissed(id: number): void {
    dismissed.add(id);
  }

  function forgetFade(id: number): void {
    fadeTimers.delete(id);
  }

  function forgetSpeed(id: number): void {
    speedBase.delete(id);
  }

  function dropTransfer(id: number): void {
    setTransfers((ts) => ts.filter((item) => item.id !== id));
  }

  function runningJob(current: TransferJob | undefined): TransferJob | undefined {
    if (current && transferIsRunning(current.state)) return current;
    return undefined;
  }

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
    if (isTerminalTransfer(progress.state)) {
      forgetSpeed(progress.id);
      clearScheduledFade(progress.id);
      fadeTimers.set(
        progress.id,
        window.setTimeout(() => {
          forgetFade(progress.id);
          markDismissed(progress.id);
          dropTransfer(progress.id);
        }, TERMINAL_KEEP_MS),
      );
    }
  }

  async function enqueuePush(
    local: string,
    remoteName: string,
    destDir: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const picked = pickedTransferSerial();
    if (listingStore.pickRejected(picked)) return picked;
    const current = picked.serial;
    const child = childPath(destDir, remoteName);
    if (listingStore.childPathRejected(child)) return child;
    const id = await filesPush({ serial: current, local, remote: child.path });
    adoptJob(createTransferJob({ id, direction: "push", name: remoteName }));
    return { ok: true };
  }

  async function push(local: string, remoteName: string, destDir?: string): Promise<void> {
    try {
      const started = await enqueuePush(local, remoteName, pushDest(destDir));
      listingStore.notifyError(started.ok ? "" : started.reason);
    } catch (e) {
      listingStore.notifyCaught(e);
    }
  }

  function requireListingSerial(): string | undefined {
    const picked = pickedTransferSerial();
    if (listingStore.pickRejected(picked)) {
      listingStore.notifyError(picked.reason);
      return undefined;
    }
    return picked.serial;
  }

  async function pushLocals(locals: string[], destDir?: string): Promise<void> {
    if (requireListingSerial() === undefined) return;
    const dest = pushDest(destDir);
    const failures: string[] = [];
    for (const local of locals) {
      const name = hostBaseName(local);
      try {
        const started = await enqueuePush(local, name, dest);
        if (!started.ok) failures.push(faultLine(name || local, started.reason));
      } catch (e) {
        failures.push(caughtFaultLine(name, e));
      }
    }
    listingStore.notifyError(joinFaultLines(failures));
  }

  async function pull(remoteName: string, local: string, expectedBytes?: number): Promise<void> {
    const current = requireListingSerial();
    if (current === undefined) return;
    const child = childPath(listingStore.session.path, remoteName);
    if (listingStore.childPathRejected(child)) {
      listingStore.notifyError(child.reason);
      return;
    }
    const known = transferKnownTotal(expectedBytes);
    try {
      const id = await filesPull({
        serial: current,
        local,
        remote: child.path,
        expected_bytes: known,
      });
      adoptJob(
        createTransferJob({
          id,
          direction: "pull",
          name: remoteName,
          total: known,
        }),
      );
      listingStore.clearListedError();
    } catch (e) {
      listingStore.notifyCaught(e);
    }
  }

  async function cancel(id: number): Promise<void> {
    try {
      await filesCancel(id);
    } catch (e) {
      if (!isNotFoundError(e)) {
        listingStore.notifyCaught(e);
        return;
      }
    }
    listingStore.clearListedError();
  }

  let dragging = false;

  async function dragOut(dragName: string): Promise<void> {
    const current = listingStore.serial();
    const generation = listingStore.generation();
    if (!current || dragging) return;
    const names = namesForDrag(listingStore.selectionNames(), dragName);
    if (names.length === 0) return;
    if (browseGenerationAbsent(generation)) return;
    const items = dragItems(names);
    if (!items.ok) {
      listingStore.notifyError(items.reason);
      return;
    }
    if (items.items.length === 0) return;
    dragging = true;
    try {
      await filesDragOut({ serial: current, generation, items: items.items });
      listingStore.clearListedError();
    } catch (e) {
      listingStore.notifyCaught(e);
    } finally {
      dragging = false;
    }
  }

  function dismiss(id: number): void {
    markDismissed(id);
    clearScheduledFade(id);
    forgetFade(id);
    forgetSpeed(id);
    const current = transfers.find((item) => item.id === id);
    dropTransfer(id);
    const running = runningJob(current);
    if (running) {
      void filesCancel(id).catch((e) => {
        if (!isNotFoundError(e)) listingStore.notifyCaught(e);
      });
    }
  }

  void onTransferProgress((e) => {
    upsertTransfer({ ...e });
    if (isTerminalTransfer(e.state) && listingStore.serial()) void listingStore.requestListing("transfer");
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
