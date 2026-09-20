/**
 * EditorView：1 可视行 = 1 条文档行（只认硬 \\n）。
 * 本文件只绘制 + Host；投影在 LineBoard。
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
import { documentMaxChars, LineBoard, visualRowKey, type VisualLine } from "./board";
import {
  EMPTY_MESSAGES,
  LogDocument,
  type DocRow,
  type FormatOptions,
  type FormatRange,
  type LogFieldKind,
} from "./document";
import { readDocSel, selSlice, type DocSel } from "./selection";

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
      return { fromCh: 0, chars: 0 };
    }
    return (
      selSlice({ seq: item().seq, docFrom: item().docFrom, text: item().text }, sel) ?? {
        fromCh: 0,
        chars: 0,
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
        style={docSelBandStyle(paint().fromCh, paint().chars) as JSX.CSSProperties}
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
  onInlineScroll?: (left: number) => void;
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
    return Math.ceil((documentMaxChars(items()) + 1) * px);
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
          hostRef={(el) => {
            const emit = (): void => props.onInlineScroll?.(el.scrollLeft);
            emit();
            el.addEventListener("scroll", emit, { passive: true });
            onCleanup(() => el.removeEventListener("scroll", emit));
          }}
          onRowContextMenu={(row, _key, event) => props.onRowContextMenu(row, event)}
          renderRow={VisualRow}
        />
      </div>
    </ViewBind.Provider>
  );
}
