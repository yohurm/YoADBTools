/**
 * EditorView：长文本 clip / wrap 与定高视口内聚。
 * 只读 Document，禁止回头调 Formatter。
 * clip / wrap 只在本层分支，不进 FormatOptions / Document。
 * clip = 官方 Soft-Wrap 关：不按视口折，硬 \\n 仍切行；hang 走 CSS，不进文档空格。
 * wrap = 视口折消息（Yohu 设计，续行 hang）。
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

export type WrapSlice = { text: string; from: number };

export function wrapBody(text: string, width: number): WrapSlice[] {
  const w = Math.max(1, Math.floor(width));
  const n = text.length;
  if (n === 0) {
    return [{ text: "", from: 0 }];
  }
  const slices: WrapSlice[] = [];
  let i = 0;
  while (i < n) {
    if (text[i] === "\n") {
      slices.push({ text: "", from: i });
      i += 1;
      continue;
    }
    const nl = text.indexOf("\n", i);
    const end = nl < 0 ? n : nl;
    let j = i;
    while (j < end) {
      const remain = end - j;
      if (remain <= w) {
        slices.push({ text: text.slice(j, end), from: j });
        j = end;
        break;
      }
      const window = text.slice(j, j + w);
      const space = window.lastIndexOf(" ");
      const take = space > 0 ? space + 1 : w;
      slices.push({ text: text.slice(j, j + take), from: j });
      j += take;
    }
    if (nl < 0) {
      break;
    }
    i = nl + 1;
    if (i === n) {
      slices.push({ text: "", from: nl });
    }
  }
  return slices;
}

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

function bodyWidth(headerChars: number, rowChars: number): number {
  if (!(rowChars > headerChars)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, rowChars - headerChars);
}

/** 对照官方 Soft-Wrap 关：只在硬 \\n 切开，行宽不封顶。 */
export function clipMessage(message: DocMessage): VisualLine[] {
  return wrapMessage(message, Number.MAX_SAFE_INTEGER);
}

export function visualLineChars(line: VisualLine): number {
  return line.hang + line.text.length;
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

export function wrapMessage(message: DocMessage, rowChars: number): VisualLine[] {
  const header = message.headerChars;
  const prefix = message.text.slice(0, header);
  const body = message.text.slice(header);
  const slices = wrapBody(body, bodyWidth(header, rowChars));
  const last = slices.length - 1;
  return slices.map((slice, wrapIndex) => {
    if (wrapIndex === 0) {
      const text = `${prefix}${slice.text}`;
      return {
        seq: message.seq,
        wrapIndex,
        docFrom: 0,
        hang: 0,
        text,
        ranges: sliceRanges(message.ranges, 0, text.length),
        bar: message.bar,
        barInk: message.barInk,
        signal: message.signal,
        collapsedAfter: last === 0 ? message.collapsedAfter : undefined,
        line: message.line,
      };
    }
    const from = header + slice.from;
    return {
      seq: message.seq,
      wrapIndex,
      docFrom: from,
      hang: header,
      text: slice.text,
      ranges: sliceRanges(message.ranges, from, from + slice.text.length),
      bar: message.bar,
      barInk: message.barInk,
      signal: message.signal,
      collapsedAfter: wrapIndex === last ? message.collapsedAfter : undefined,
      line: message.line,
    };
  });
}

export class VisualBoard {
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
      return { fromCh: 0, chars: 0, hang: item().hang };
    }
    return (
      selSlice({ seq: item().seq, docFrom: item().docFrom, text: item().text, hang: item().hang }, sel) ?? {
        fromCh: 0,
        chars: 0,
        hang: item().hang,
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
        {
          ...(item().barInk ? { "--yohu-log-ink": item().barInk } : {}),
          ...(item().hang > 0 ? { "--yohu-log-hang": item().hang } : {}),
        } as JSX.CSSProperties
      }
      classList={{
        "yohu-logs__row--signal": item().signal !== undefined,
      }}
    >
      <span
        class="yohu-doc-sel"
        data-log-chrome
        style={docSelBandStyle(paint().fromCh, paint().chars, paint().hang) as JSX.CSSProperties}
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
  onInlineOffset?: (left: number) => void;
  documentRef?: (doc: LogDocument) => void;
}) {
  const logDoc = new LogDocument();
  const board = new VisualBoard();
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
    return visualBoardChars(items()) * px;
  });

  return (
    <ViewBind.Provider
      value={{
        keyword: props.keyword,
        docSel,
      }}
    >
      <div class="yohu-logs__view" data-layout={props.layout()} ref={(el) => { host = el; }}>
        <YoVirtualList<VisualLine>
          items={items}
          itemHeight={props.itemHeight}
          getItemKey={visualRowKey}
          contentWidth={contentWidth}
          onInlineOffset={props.onInlineOffset}
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
