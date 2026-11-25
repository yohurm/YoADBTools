/**
 * 清单复制：逻辑表面 === Document.text。对照 Logcat 默认 Ctrl+C = Document 切片。
 * 选区范围由 editor/selection 读出；本文件只序列化与写剪贴板。
 */

import { docSelCopyText, finiteOrNull, logSelectionInList, readDocSel, rowOf, textOffsetInDoc } from "./editor/selection";

export type LogCopyScope = { kind: "none" } | { kind: "all" };
export type CopyMessage = { seq: number; text: string };

export const LOG_COPY_NONE: LogCopyScope = { kind: "none" };
export const LOG_COPY_ALL: LogCopyScope = { kind: "all" };

/** 全选复制。范围只有全选与无，手势、载荷和序列化都认这一把。 */
export function copyScopeIsAll(scope: LogCopyScope): boolean {
  return scope.kind === "all";
}

export { logSelectionInList, textOffsetInDoc };

export function seqFromTarget(target: EventTarget | null): number | null {
  if (!(target instanceof Node)) {
    return null;
  }
  const raw = rowOf(target)?.dataset.seq;
  if (!raw) {
    return null;
  }
  return finiteOrNull(Number(raw));
}

export function copyHasPayload(opts: {
  pick: LogCopyScope;
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackText?: string;
}): boolean {
  if (copyScopeIsAll(opts.pick)) {
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
  return resolveLogCopy(opts).text;
}

/** 复制的分类结果：全选 / 选区 / 回退行 / 无载荷 / 选区失效。 */
export type CopyOutcomeKind = "all" | "selection" | "fallback" | "none" | "stale";
export type CopyOutcome = { kind: CopyOutcomeKind; text: string };

/** 失效选区提示（行被裁掉后选区引用落空）。 */
export const STALE_SELECTION_TEXT = "选区已失效（相关行已滚出窗口），请重新选择";

/**
 * 一次判定：分类 + 载荷。选区存在但切片为空（行已裁掉）判 stale，上层据此提示，
 * 不再静默返回空串。
 */
export function resolveLogCopy(opts: {
  pick: LogCopyScope;
  messages: readonly CopyMessage[];
  listRoot: ParentNode | null;
  selection: Selection | null;
  fallbackText?: string;
}): CopyOutcome {
  if (copyScopeIsAll(opts.pick)) {
    return { kind: "all", text: opts.messages.map((item) => item.text).join("\n") };
  }
  if (readDocSel(opts.listRoot, opts.selection)) {
    const text = documentCopyText(opts.listRoot, opts.selection, opts.messages);
    return text ? { kind: "selection", text } : { kind: "stale", text: "" };
  }
  if (opts.fallbackText) {
    return { kind: "fallback", text: opts.fallbackText };
  }
  return { kind: "none", text: "" };
}

export function applyCopyEvent(event: ClipboardEvent, text: string): boolean {
  if (!text) {
    return false;
  }
  event.preventDefault();
  event.clipboardData?.setData("text/plain", text);
  return true;
}
