/**
 * 清单复制手势：Ctrl+C / 原生 copy、指针开始新划选时清 ALL、选区变化。
 * Ctrl+A 的 selectAllChildren 触发的 selectionchange 必须保住 ALL。
 * 冻结只认 YoVirtualList onAtBottomChange，这里不旁路 detachFollow。
 */

import { isEditableTarget } from "@yohu/ui";

import {
  applyCopyEvent,
  copyScopeIsAll,
  LOG_COPY_NONE,
  logSelectionInList,
  type LogCopyScope,
} from "./copy";

function eventTargetIn(root: ParentNode, target: EventTarget | null): boolean {
  return target instanceof Node && root.contains(target);
}

function listen<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
): () => void {
  document.addEventListener(type, handler);
  return () => document.removeEventListener(type, handler);
}

export function attachLogCopyGestures(opts: {
  listRoot: () => ParentNode | null;
  pick: () => LogCopyScope;
  setPick: (next: LogCopyScope) => void;
  copyText: () => string;
}): () => void {
  const onCopy = (event: ClipboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const root = opts.listRoot();
    const selection = window.getSelection();
    const inList = Boolean(
      root && (eventTargetIn(root, event.target) || logSelectionInList(root, selection)),
    );
    if (!inList && !copyScopeIsAll(opts.pick())) return;
    applyCopyEvent(event, opts.copyText());
  };
  const onPointerDown = (event: PointerEvent): void => {
    const root = opts.listRoot();
    if (!root || !eventTargetIn(root, event.target)) return;
    if (event.button !== 0) return;
    if (copyScopeIsAll(opts.pick())) opts.setPick(LOG_COPY_NONE);
  };
  const onSelectionChange = (): void => {
    if (copyScopeIsAll(opts.pick())) return;
    if (logSelectionInList(opts.listRoot(), window.getSelection())) {
      opts.setPick(LOG_COPY_NONE);
    }
  };
  const stopCopy = listen("copy", onCopy);
  const stopPointerDown = listen("pointerdown", onPointerDown);
  const stopSelectionChange = listen("selectionchange", onSelectionChange);
  return () => {
    stopCopy();
    stopPointerDown();
    stopSelectionChange();
  };
}
