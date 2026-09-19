/**
 * EditorView：软折行与定高视口内聚。
 * 只读 Document，禁止回头调 Formatter。
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

import type { LogLine } from "@yohu/api";
import { YoVirtualList } from "@yohu/ui";

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
  private items: VisualLine[] = EMPTY_VISUAL;

  project(messages: readonly DocMessage[], rowChars: number): VisualLine[] {
    if (messages === this.messages && rowChars === this.rowChars) {
      return this.items;
    }
    if (rowChars !== this.rowChars) {
      this.rowChars = rowChars;
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
      const tail = messages.slice(this.messages.length).flatMap((row) => wrapMessage(row, this.rowChars));
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
    this.items = messages.flatMap((row) => wrapMessage(row, this.rowChars));
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
  pickAll: Accessor<boolean>;
}>();

function VisualRow(props: { item: VisualLine; index: number }) {
  const bind = useContext(ViewBind)!;
  const item = (): VisualLine => props.item;
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
        "yohu-logs__row--picked": bind.pickAll(),
      }}
    >
      <For each={item().ranges}>
        {(range) =>
          range.role === "pad" ? (
            <span data-log-pad>{item().text.slice(range.start, range.end)}</span>
          ) : (
            <FieldSpan range={range} text={item().text.slice(range.start, range.end)} keyword={bind.keyword()} />
          )
        }
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
  rowChars: Accessor<number>;
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
  const board = new VisualBoard();
  const [rev, setRev] = createSignal(0);
  onMount(() => props.documentRef?.(logDoc));
  onCleanup(() => logDoc.clear());

  createEffect(() => {
    const optChanged = logDoc.setOptions(props.options());
    const docChanged = logDoc.sync(props.rows());
    if (optChanged || docChanged) {
      setRev((n) => n + 1);
    }
  });

  const items = createMemo(() => {
    rev();
    return board.project(logDoc.messages.length === 0 ? EMPTY_MESSAGES : logDoc.messages, props.rowChars());
  });

  return (
    <ViewBind.Provider
      value={{
        keyword: props.keyword,
        pickAll: props.pickAll,
      }}
    >
      <YoVirtualList<VisualLine>
        items={items}
        itemHeight={props.itemHeight}
        getItemKey={visualRowKey}
        autoScrollToBottom={() => props.following() && !props.paused()}
        onAtBottomChange={props.onAtBottomChange}
        ariaLabel="日志列表"
        onRowContextMenu={(row, _key, event) => props.onRowContextMenu(row, event)}
        renderRow={VisualRow}
      />
    </ViewBind.Provider>
  );
}
