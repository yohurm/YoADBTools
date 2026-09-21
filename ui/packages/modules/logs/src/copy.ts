/**
 * 清单复制：逻辑表面 === Document.text。对照 Logcat 默认 Ctrl+C = Document 切片。
 * 选区范围由 editor/selection 读出；本文件只序列化与写剪贴板。
 */

import { docSelCopyText, logSelectionInList, readDocSel, textOffsetInDoc } from "./editor/selection";

export type LogCopyScope = { kind: "none" } | { kind: "all" };
export type CopyMessage = { seq: number; text: string };

export const LOG_COPY_NONE: LogCopyScope = { kind: "none" };
export const LOG_COPY_ALL: LogCopyScope = { kind: "all" };

export { logSelectionInList, textOffsetInDoc };

export function seqFromTarget(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const raw = el?.closest<HTMLElement>("[data-seq]")?.dataset.seq;
  if (!raw) {
    return null;
  }
  const seq = Number(raw);
  return Number.isFinite(seq) ? seq : null;
}

export function copyHasPayload(opts: {
  pick: LogCopyScope;
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackText?: string;
}): boolean {
  if (opts.pick.kind === "all") {
    return true;
  }
  if (logSelectionInList(opts.listRoot, opts.selection)) {
    return true;
  }
  return Boolean(opts.fallbackText);
}

export function documentCopyText(
  listRoot: ParentNode | null,
  selection: Selection | null,
  messages: readonly CopyMessage[],
): string {
  const sel = readDocSel(listRoot, selection);
  if (!sel) {
    return "";
  }
  return docSelCopyText(sel, messages);
}

export function serializeLogCopy(opts: {
  pick: LogCopyScope;
  messages: readonly CopyMessage[];
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackText?: string;
}): string {
  if (opts.pick.kind === "all") {
    return opts.messages.map((item) => item.text).join("\n");
  }
  const fromSelection = documentCopyText(opts.listRoot, opts.selection, opts.messages);
  if (fromSelection) {
    return fromSelection;
  }
  return opts.fallbackText ?? "";
}

export function applyCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text) {
    return false;
  }
  event.preventDefault();
  event.clipboardData?.setData("text/plain", text);
  return true;
}
