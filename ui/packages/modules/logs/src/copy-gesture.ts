/**
 * 清单复制手势：Ctrl+C / 原生 copy、指针开始新划选时清 ALL、选区变化。
 * Ctrl+A 的 selectAllChildren 触发的 selectionchange 必须保住 ALL。
 * 冻结只认 YoVirtualList onAtBottomChange，这里不旁路 detachFollow。
 */

import { isEditableTarget } from "@yohu/ui";

import {
  applyCopyEvent,
  LOG_COPY_NONE,
  logSelectionInList,
  type LogCopyScope,
} from "./copy";

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
      root &&
        ((event.target instanceof Node && root.contains(event.target)) || logSelectionInList(root, selection)),
    );
    if (!inList && opts.pick().kind !== "all") return;
    applyCopyEvent(event, opts.copyText());
  };
  const onPointerDown = (event: PointerEvent): void => {
    const root = opts.listRoot();
    if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
    if (event.button !== 0) return;
    if (opts.pick().kind !== "none") opts.setPick(LOG_COPY_NONE);
  };
  const onSelectionChange = (): void => {
    if (opts.pick().kind === "all") return;
    if (logSelectionInList(opts.listRoot(), window.getSelection())) {
      opts.setPick(LOG_COPY_NONE);
    }
  };
  document.addEventListener("copy", onCopy);
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("selectionchange", onSelectionChange);
  return () => {
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("selectionchange", onSelectionChange);
  };
}
