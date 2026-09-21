/**
 * EditorView：1 可视行 = 1 条文档行（只认硬 \\n）。
 * 本文件只 Host + 组合：Document 文本、Markup 着色、关键字偏移、原生选区。
 * 禁止视口预切进文档、禁止 CSS hang、禁止回调 Formatter、禁止按 range 拆 span 盒。
 * BACKGROUND 几何在 markup-wash（文本节点 1ch 格），本文件只组合。
 */

import {
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
import { YoVirtualList } from "@yohu/ui";

import { keywordRangesInWindows } from "../highlight";
import { documentMaxChars, LineBoard, visualRowKey, type VisualLine } from "./board";
import { EMPTY_MESSAGES, LogDocument, type DocRow, type FormatOptions } from "./document";
import "./markup.css";
import { markupRunsFromRanges } from "./markup-model";
import { MARKUP_MARK_NAME, nameMarkupRuns } from "./markup-policy";
import { bindMarkupRuns } from "./markup-registry";
import { bindWashPaint } from "./markup-wash";

const ViewBind = createContext<{
  keyword: Accessor<string>;
}>();

function VisualRow(props: { item: VisualLine; index: number }) {
  const bind = useContext(ViewBind)!;
  const item = (): VisualLine => props.item;
  let textEl: HTMLSpanElement | undefined;
  createEffect(() => {
    const line = item();
    const keyword = bind.keyword();
    const el = textEl;
    if (!el) {
      return;
    }
    if (el.childNodes.length !== 1 || el.firstChild?.nodeType !== Node.TEXT_NODE) {
      el.textContent = line.text;
    } else if ((el.firstChild as Text).data !== line.text) {
      (el.firstChild as Text).data = line.text;
    }
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return;
    }
    const markup = markupRunsFromRanges(line.ranges);
    const runs = [
      ...nameMarkupRuns(markup),
      ...keywordRangesInWindows(line.text, line.ranges, keyword).map((hit) => ({
        from: hit.from,
        to: hit.to,
        name: MARKUP_MARK_NAME,
      })),
    ];
    const wash = markup.flatMap((run) =>
      run.paint.kind === "wash" ? [{ from: run.from, to: run.to, fill: run.paint.background }] : [],
    );
    const stopInk = bindMarkupRuns(node as Text, runs);
    const stopWash = bindWashPaint(el, wash);
    onCleanup(() => {
      stopInk();
      stopWash();
    });
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
      <span class="yohu-logs__text" ref={(el) => { textEl = el; }} />
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
  following: Accessor<boolean>;
  paused: Accessor<boolean>;
  onAtBottomChange: (atBottom: boolean) => void;
  onRowContextMenu: (row: { line: LogLine }, event: MouseEvent) => void;
  documentRef?: (doc: LogDocument) => void;
}) {
  const logDoc = new LogDocument();
  const board = new LineBoard();
  const [rev, setRev] = createSignal(0);
  onMount(() => {
    props.documentRef?.(logDoc);
  });
  onCleanup(() => {
    logDoc.clear();
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
      value={{ keyword: props.keyword }}
    >
      <div class="yohu-logs__view" data-layout={props.layout()}>
        <YoVirtualList<VisualLine>
          items={items}
          itemHeight={props.itemHeight}
          getItemKey={visualRowKey}
          contentWidth={contentWidth}
          autoScrollToBottom={() => props.following() && !props.paused()}
          onAtBottomChange={props.onAtBottomChange}
          ariaLabel="日志列表"
          onOffset={(_, inline) => props.onInlineScroll?.(inline)}
          onRowContextMenu={(row, _key, event) => props.onRowContextMenu(row, event)}
          renderRow={VisualRow}
          state="on"
        />
      </div>
    </ViewBind.Provider>
  );
}
