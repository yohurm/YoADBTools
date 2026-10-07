/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，清单在 listingStore。
 * 轨道走 YoColFrame；表头 YoColRow / YoColHeader；行 YoColTrack / YoColCell。
 * FileRow 必须是模块级组件：槽位回收时就地换绑 props.item，禁止在 FileTable 内新建函数当 renderRow。
 * 投放热态走 VirtualList hotKey（行底 + list-frame 框），禁止模块 --drop。
 */

import { For, Match, Switch } from "solid-js";

import {
  Layout,
  YoColCell,
  YoColFrame,
  YoColHeader,
  YoColRow,
  YoColTrack,
  YoEmptyState,
  YoFileIcon,
  YoLoading,
  YoVirtualList,
  controlRowHeight,
  pointerSelectMode,
  type YoColHeaderSort,
} from "@yohu/ui";
import { listingStore } from "./listing";
import { listingPaint, listingPaintIsCold, listingPaintIsEmpty, listingPaintIsRows } from "./listing-paint";
import {
  FILE_COLUMNS,
  fileColTemplate,
  fileTypeLabel,
  entryOpensAsDir,
  entrySizeText,
  sortDirIsAsc,
  type FileColumnSpec,
  type ListingEntry,
} from "./model";
import { transferStore } from "./transfers";

const FILE_COLUMN_LIST = [...FILE_COLUMNS];

function ColHead(props: { col: FileColumnSpec }) {
  const ariaSort = (): YoColHeaderSort => {
    if (listingStore.sort.key !== props.col.key) return "none";
    return sortDirIsAsc(listingStore.sort.dir) ? "ascending" : "descending";
  };
  return (
    <YoColHeader
      align={props.col.align}
      ariaSort={ariaSort()}
      resizable={!props.col.flex}
      resizeLabel={props.col.resizeLabel}
      width={listingStore.ui.colWidths[props.col.key] ?? props.col.defaultWidth}
      minWidth={props.col.minWidth}
      onWidthChange={(width) => listingStore.setColWidth(props.col.key, width)}
      onSort={() => listingStore.setSort(props.col.key)}
    >
      {props.col.header}
    </YoColHeader>
  );
}

function FileCell(props: { entry: ListingEntry; col: FileColumnSpec }) {
  const type = (): string => fileTypeLabel(props.entry);
  const size = (): string => entrySizeText(props.entry.kind, props.entry.size, "");
  const mtime = (): string => props.entry.mtime;
  switch (props.col.key) {
    case "name":
      return (
        <YoColCell class="yohu-files__name">
          <YoFileIcon name={props.entry.name} folder={entryOpensAsDir(props.entry.kind)} size={Layout.IconSm} />
          <span class="yohu-files__name-text">{props.entry.name}</span>
        </YoColCell>
      );
    case "type":
      return <YoColCell class="yohu-files__cell">{type()}</YoColCell>;
    case "size":
      return <YoColCell class="yohu-files__num">{size()}</YoColCell>;
    case "mtime":
      return <YoColCell class="yohu-files__mtime">{mtime()}</YoColCell>;
  }
}

function FileRow(props: { item: ListingEntry; index: number }) {
  const entry = (): ListingEntry => props.item;
  return (
    <YoColTrack
      class="yohu-files__cols yohu-files__row"
      data-kind={entry().kind}
      draggable="true"
      onDragStart={(event) => {
        cancelNative(event);
        listingStore.selectGestureTarget(entry().name);
        void transferStore.dragOut(entry().name);
      }}
      onDblClick={() => {
        void listingStore.enterDirectory(entry().name);
      }}
    >
      <For each={FILE_COLUMN_LIST}>{(col) => <FileCell entry={entry()} col={col} />}</For>
    </YoColTrack>
  );
}

function cancelNative(event: { preventDefault(): void }): void {
  event.preventDefault();
}

export function FileTable(props: {
  onContextMenu: (x: number, y: number) => void;
  dropDirName?: string | null;
  listRef?: (el: HTMLDivElement) => void;
  onOffset?: (block: number) => void;
}) {
  const openMenuAt = (event: { clientX: number; clientY: number }): void => {
    props.onContextMenu(event.clientX, event.clientY);
  };
  const colTemplate = (): string => fileColTemplate(listingStore.ui.colWidths);
  const entries = (): ListingEntry[] => listingStore.entries;
  const paint = (): ReturnType<typeof listingPaint> =>
    listingPaint(entries().length, listingStore.session.loading, listingStore.session.cold);

  return (
    <YoColFrame template={colTemplate()}>
      <YoColRow class="yohu-files__cols--head">
        <For each={FILE_COLUMN_LIST}>{(col) => <ColHead col={col} />}</For>
      </YoColRow>
      <div
        class="yohu-files__table-list"
        onContextMenu={(event) => {
          cancelNative(event);
          listingStore.clearSelection();
          openMenuAt(event);
        }}
      >
        <Switch>
          <Match when={listingPaintIsRows(paint())}>
            <YoVirtualList<ListingEntry>
              items={entries}
              itemHeight={controlRowHeight()}
              tone="list"
              getItemKey={(entry) => entry.name}
              ariaLabel="文件列表"
              hostRef={props.listRef}
              onOffset={(block) => props.onOffset?.(block)}
              selectedKeys={listingStore.selectedSet}
              hotKey={() => props.dropDirName ?? null}
              onSelectRow={(entry, _key, event) => {
                listingStore.select(entry.name, pointerSelectMode(event));
              }}
              onRowContextMenu={(entry, _key, event) => {
                listingStore.selectGestureTarget(entry.name);
                openMenuAt(event);
              }}
              renderRow={FileRow}
            />
          </Match>
          <Match when={listingPaintIsCold(paint())}>
            <YoLoading fill title="加载中" description="正在读取目录" />
          </Match>
          <Match when={listingPaintIsEmpty(paint())}>
            <YoEmptyState fill icon="folder" title="此文件夹为空" />
          </Match>
        </Switch>
      </div>
    </YoColFrame>
  );
}
