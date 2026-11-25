/**
 * 清单复制编舞：取当前文档消息、序列化选区/回退文本、写剪贴板。
 * 纯序列化走 `copy.ts`；本文件只管「取哪份文档、失败提示」，不碰渲染。
 */

import { writeClipboard, clipboardFailureText } from "@yohu/api";

import { resolveLogCopy, STALE_SELECTION_TEXT, type CopyOutcome, type CopyMessage, type LogCopyScope } from "./copy";
import type { DocMessage } from "./editor";
import type { ViewRow } from "./stack";

export type CopyController = {
  copyMessages: () => CopyMessage[];
  fallbackTextOf: (line?: ViewRow["line"] | null) => string | undefined;
  copyText: (scope?: LogCopyScope, fallbackLine?: ViewRow["line"] | null) => string;
  copySelected: (scope?: LogCopyScope, fallbackLine?: ViewRow["line"] | null) => boolean;
};

export function createCopyController(opts: {
  activeMessages: () => readonly DocMessage[];
  listEl: () => ParentNode | null;
  pick: () => LogCopyScope;
  contextLine: () => ViewRow["line"] | null;
  showFailure: (failure: string) => void;
}): CopyController {
  const copyMessages = (): CopyMessage[] =>
    (opts.activeMessages() ?? []).map((item) => ({ seq: item.seq, text: item.text }));

  const fallbackTextOf = (line?: ViewRow["line"] | null): string | undefined => {
    const seq = line?.seq;
    if (seq == null) {
      return undefined;
    }
    return copyMessages().find((item) => item.seq === seq)?.text;
  };

  const resolve = (
    scope: LogCopyScope,
    fallbackLine?: ViewRow["line"] | null,
  ): CopyOutcome =>
    resolveLogCopy({
      pick: scope,
      messages: copyMessages(),
      listRoot: opts.listEl(),
      selection: typeof window === "undefined" ? null : window.getSelection(),
      fallbackText: fallbackTextOf(fallbackLine ?? opts.contextLine()),
    });

  const copyText = (
    scope: LogCopyScope = opts.pick(),
    fallbackLine?: ViewRow["line"] | null,
  ): string => resolve(scope, fallbackLine).text;

  const copySelected = (
    scope: LogCopyScope = opts.pick(),
    fallbackLine?: ViewRow["line"] | null,
  ): boolean => {
    const outcome = resolve(scope, fallbackLine);
    if (outcome.kind === "stale") {
      opts.showFailure(STALE_SELECTION_TEXT);
      return false;
    }
    if (!outcome.text) return false;
    void writeClipboard(outcome.text).then((result) => {
      const failure = clipboardFailureText(result);
      if (failure) opts.showFailure(failure);
    });
    return true;
  };

  return { copyMessages, fallbackTextOf, copyText, copySelected };
}
