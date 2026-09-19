/**
 * EditorView：1 可视行 = 1 条文档行（只认硬 \\n）。
 * clip = Soft-Wrap 关：文档已含 hang 空格，超长行不按视口拆。
 * wrap = Soft-Wrap 开：文档无 hang 空格；超长行按视口切到第 0 列。
 * 禁止视口预切进文档、禁止 CSS hang、禁止回调 Formatter。
 */

import {
  For,
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";

import type { LogLine, LogLineLayout } from "@yohu/api";
import { docSelBandStyle, YoVirtualList } from "@yohu/ui";

import { highlightMessage } from "../highlight";
import type { SignalKind } from "../signals";
import {
  EMPTY_MESSAGES,
  LogDocument,
  type ContentBar,
  type DocMessage,
  type DocRow,
  type FormatOptions,
  type FormatRange,
  type LogFieldKind,
} from "./document";
import { readDocSel, selSlice, type DocSel } from "./selection";

export type VisualLine = {
  seq: number;
  wrapIndex: number;
  docFrom: number;
  hang: number;
  text: string;
  ranges: FormatRange[];
  bar: ContentBar;
  barInk?: string;
  signal?: SignalKind;
  collapsedAfter?: number;
  line: LogLine;
};

const EMPTY_VISUAL: VisualLine[] = [];

function sliceRanges(ranges: readonly FormatRange[], from: number, to: number): FormatRange[] {
  const out: FormatRange[] = [];
  for (const range of ranges) {
    const start = Math.max(range.start, from);
    const end = Math.min(range.end, to);
    if (end <= start) {
      continue;
    }
    out.push({ ...range, start: start - from, end: end - from });
  }
  return out;
}

function lineOf(
  message: DocMessage,
  wrapIndex: number,
  docFrom: number,
  text: string,
  last: boolean,
): VisualLine {
  return {
    seq: message.seq,
    wrapIndex,
    docFrom,
    hang: 0,
    text,
    ranges: sliceRanges(message.ranges, docFrom, docFrom + text.length),
    bar: message.bar,
    barInk: message.barInk,
    signal: message.signal,
    collapsedAfter: last ? message.collapsedAfter : undefined,
    line: message.line,
  };
}

/** 只按文档硬 \\n 切开。hang 已在 Document 空格里。 */
export function documentLines(message: DocMessage): VisualLine[] {
  const parts = message.text.split("\n");
  let offset = 0;
  const last = parts.length - 1;
  return parts.map((text, wrapIndex) => {
    const row = lineOf(message, wrapIndex, offset, text, wrapIndex === last);
    offset += text.length + (wrapIndex === last ? 0 : 1);
    return row;
  });
}

export function clipMessage(message: DocMessage): VisualLine[] {
  return documentLines(message);
}

function wrapDocumentLine(text: string, from: number, width: number): { text: string; from: number }[] {
  const w = Math.max(1, Math.floor(width));
  if (text.length === 0) {
    return [{ text: "", from }];
  }
  if (!(w < text.length)) {
    return [{ text, from }];
  }
  const out: { text: string; from: number }[] = [];
  for (let i = 0; i < text.length; i += w) {
    out.push({ text: text.slice(i, i + w), from: from + i });
  }
  return out;
}

/** Soft-Wrap 开：文档行再按视口切，续行第 0 列。 */
export function wrapMessage(message: DocMessage, rowChars: number): VisualLine[] {
  const width = Math.max(1, Math.floor(rowChars) || Number.MAX_SAFE_INTEGER);
  const rows: VisualLine[] = [];
  const parts = message.text.split("\n");
  let offset = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]!;
    const slices = wrapDocumentLine(part, offset, width);
    for (const slice of slices) {
      rows.push(lineOf(message, rows.length, slice.from, slice.text, false));
    }
    offset += part.length + (i === parts.length - 1 ? 0 : 1);
  }
  if (rows.length > 0) {
    rows[rows.length - 1] = { ...rows[rows.length - 1]!, collapsedAfter: message.collapsedAfter };
  }
  return rows.length > 0 ? rows : [lineOf(message, 0, 0, "", true)];
}

export function visualLineChars(line: VisualLine): number {
  return line.text.length;
}

export function visualBoardChars(lines: readonly VisualLine[]): number {
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, visualLineChars(line));
  }
  return max;
}

function projectMessage(message: DocMessage, rowChars: number, layout: LogLineLayout): VisualLine[] {
  return layout === "wrap" ? wrapMessage(message, rowChars) : clipMessage(message);
}

export class LineBoard {
  private messages: readonly DocMessage[] | null = null;
  private rowChars = -1;
  private layout: LogLineLayout = "clip";
  private items: VisualLine[] = EMPTY_VISUAL;

  project(messages: readonly DocMessage[], rowChars: number, layout: LogLineLayout): VisualLine[] {
    const widthKey = layout === "wrap" ? rowChars : 0;
    if (messages === this.messages && widthKey === this.rowChars && layout === this.layout) {
      return this.items;
    }
    if (widthKey !== this.rowChars || layout !== this.layout) {
      this.rowChars = widthKey;
      this.layout = layout;
      this.messages = null;
    }
    if (messages === this.messages) {
      return this.items;
    }
    if (messages.length === 0) {
      this.messages = messages;
      this.items = EMPTY_VISUAL;
      return this.items;
    }
    if (
      this.messages &&
      messages.length >= this.messages.length &&
      this.messages.every((row, i) => row === messages[i])
    ) {
      if (messages.length === this.messages.length) {
        this.messages = messages;
        return this.items;
      }
      const tail = messages
        .slice(this.messages.length)
        .flatMap((row) => projectMessage(row, this.rowChars, this.layout));
      this.items = this.items === EMPTY_VISUAL ? tail : this.items.concat(tail);
      this.messages = messages;
      return this.items;
    }
    if (
      this.messages &&
      this.messages.length > messages.length &&
      messages.every((row, i) => row === this.messages![this.messages!.length - messages.length + i])
    ) {
      const drop = this.messages.length - messages.length;
      let remove = 0;
      for (let i = 0; i < drop; i += 1) {
        const seq = this.messages[i]!.seq;
        while (remove < this.items.length && this.items[remove]!.seq === seq) {
          remove += 1;
        }
      }
      this.items = this.items.slice(remove);
      this.messages = messages;
      return this.items;
    }
    this.items = messages.flatMap((row) => projectMessage(row, this.rowChars, this.layout));
    this.messages = messages;
    return this.items;
  }
}

export function visualRowKey(row: VisualLine): string {
  return `${row.seq}-${row.wrapIndex}`;
}

function tokenClass(kind: LogFieldKind): string {
  return `yohu-logs__row-${kind}`;
}

function FieldSpan(props: { range: FormatRange; text: string; keyword: string }) {
  const painted = (): boolean => props.range.tone === "ink" || props.range.tone === "wash";
  return (
    <span
      class={tokenClass(props.range.kind)}
      classList={{ "yohu-tone": painted() }}
      data-tone={painted() ? props.range.tone : undefined}
      data-box={props.range.box === "line" ? "line" : undefined}
      style={props.range.style as JSX.CSSProperties | undefined}
    >
      <Show when={props.range.kind === "msg" && props.keyword} keyed fallback={props.text}>
        {(keyword) => (
          <For each={highlightMessage(props.text, keyword)}>
            {(chunk) =>
              typeof chunk === "string" ? chunk : <mark class="yohu-logs__mark yohu-tone">{chunk.mark}</mark>
            }
          </For>
        )}
      </Show>
    </span>
  );
}

const ViewBind = createContext<{
  keyword: Accessor<string>;
  docSel: Accessor<DocSel | "all" | null>;
}>();

function VisualRow(props: { item: VisualLine; index: number }) {
  const bind = useContext(ViewBind)!;
  const item = (): VisualLine => props.item;
  const paint = createMemo(() => {
    const sel = bind.docSel();
    if (!sel) {
      return { fromCh: 0, chars: 0, hang: 0 };
    }
    return (
      selSlice({ seq: item().seq, docFrom: item().docFrom, text: item().text, hang: 0 }, sel) ?? {
        fromCh: 0,
        chars: 0,
        hang: 0,
      }
    );
  });
  return (
    <div
      class="yohu-logs__cols yohu-logs__row"
      data-seq={String(item().seq)}
      data-wrap={String(item().wrapIndex)}
      data-doc-from={String(item().docFrom)}
      data-bar={item().bar}
      style={
        (item().barInk ? { "--yohu-log-ink": item().barInk } : {}) as JSX.CSSProperties
      }
      classList={{
        "yohu-logs__row--signal": item().signal !== undefined,
      }}
    >
      <span
        class="yohu-doc-sel"
        data-log-chrome
        style={docSelBandStyle(paint().fromCh, paint().chars, 0) as JSX.CSSProperties}
      />
      <For each={item().ranges}>
        {(range) => (
          <FieldSpan range={range} text={item().text.slice(range.start, range.end)} keyword={bind.keyword()} />
        )}
      </For>
      <Show when={item().collapsedAfter}>
        <span class="yohu-logs__row-fold" data-log-chrome>
          …{item().collapsedAfter} 帧折叠
        </span>
      </Show>
    </div>
  );
}

export function EditorView(props: {
  rows: Accessor<readonly DocRow[]>;
  options: Accessor<FormatOptions>;
  layout: Accessor<LogLineLayout>;
  rowChars: Accessor<number>;
  chPx: Accessor<number>;
  itemHeight: number;
  keyword: Accessor<string>;
  pickAll: Accessor<boolean>;
  following: Accessor<boolean>;
  paused: Accessor<boolean>;
  onAtBottomChange: (atBottom: boolean) => void;
  onRowContextMenu: (row: { line: LogLine }, event: MouseEvent) => void;
  documentRef?: (doc: LogDocument) => void;
}) {
  const logDoc = new LogDocument();
  const board = new LineBoard();
  const [rev, setRev] = createSignal(0);
  const [docSel, setDocSel] = createSignal<DocSel | "all" | null>(null);
  let host: HTMLDivElement | undefined;
  const syncSel = (): void => {
    if (props.pickAll()) {
      setDocSel("all");
      return;
    }
    const lenOf = (seq: number) => logDoc.messages.find((item) => item.seq === seq)?.text.length;
    setDocSel(readDocSel(host ?? null, typeof window === "undefined" ? null : window.getSelection(), lenOf));
  };
  onMount(() => {
    props.documentRef?.(logDoc);
    document.addEventListener("selectionchange", syncSel);
    syncSel();
  });
  onCleanup(() => {
    document.removeEventListener("selectionchange", syncSel);
    logDoc.clear();
  });
  createEffect(() => {
    props.pickAll();
    syncSel();
  });

  createEffect(() => {
    const optChanged = logDoc.setOptions(props.options());
    const docChanged = logDoc.sync(props.rows());
    if (optChanged || docChanged) {
      setRev((n) => n + 1);
    }
  });

  const items = createMemo(() => {
    rev();
    return board.project(
      logDoc.messages.length === 0 ? EMPTY_MESSAGES : logDoc.messages,
      props.rowChars(),
      props.layout(),
    );
  });

  const contentWidth = createMemo(() => {
    if (props.layout() !== "clip") {
      return 0;
    }
    const px = props.chPx();
    if (!(px > 0)) {
      return 0;
    }
    return Math.ceil((visualBoardChars(items()) + 1) * px);
  });

  return (
    <ViewBind.Provider
      value={{
        keyword: props.keyword,
        docSel,
      }}
    >
      <div
        class="yohu-logs__view"
        data-layout={props.layout()}
        ref={(el) => { host = el; }}
      >
        <YoVirtualList<VisualLine>
          items={items}
          itemHeight={props.itemHeight}
          getItemKey={visualRowKey}
          contentWidth={contentWidth}
          autoScrollToBottom={() => props.following() && !props.paused()}
          onAtBottomChange={props.onAtBottomChange}
          ariaLabel="日志列表"
          onRowContextMenu={(row, _key, event) => props.onRowContextMenu(row, event)}
          renderRow={VisualRow}
        />
      </div>
    </ViewBind.Provider>
  );
}
