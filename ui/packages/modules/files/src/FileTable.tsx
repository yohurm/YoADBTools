/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，状态全在 fileStore。
 * 轨道走 YoColFrame；表头 YoColRow / YoColHeader；行 YoColTrack / YoColCell。
 * FileRow 必须是模块级组件：槽位回收时就地换绑 props.item，禁止在 FileTable 内新建函数当 renderRow。
 */

import { For, Show, createContext, useContext, type Accessor } from "solid-js";

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
  pointerSelectMode,
} from "@yohu/ui";
import type { RemoteEntry } from "@yohu/api";

import { controlRowHeight } from "./layout";
import {
  FILE_COLUMNS,
  fileColTemplate,
  fileTypeLabel,
  formatSize,
  type FileColumnSpec,
} from "./model";
import { fileStore } from "./store";

const FILE_COLUMN_LIST = [...FILE_COLUMNS];

const FileTableBind = createContext<{ dropDirName: Accessor<string | null | undefined> }>();

function ColHead(props: { col: FileColumnSpec }) {
  const ariaSort = (): "ascending" | "descending" | "none" => {
    if (fileStore.sort.key !== props.col.key) return "none";
    return fileStore.sort.dir === "asc" ? "ascending" : "descending";
  };
  return (
    <YoColHeader
      align={props.col.align}
      ariaSort={ariaSort()}
      resizable={!props.col.flex}
      resizeLabel={props.col.resizeLabel}
      width={fileStore.ui.colWidths[props.col.key] ?? props.col.defaultWidth}
      minWidth={props.col.minWidth}
      onWidthChange={(width) => fileStore.setColWidth(props.col.key, width)}
      onSort={() => fileStore.setSort(props.col.key)}
    >
      {props.col.header}
    </YoColHeader>
  );
}

function FileCell(props: { entry: RemoteEntry; col: FileColumnSpec }) {
  const type = (): string => fileTypeLabel(props.entry);
  const size = (): string => (props.entry.kind === "file" ? formatSize(props.entry.size) : "");
  const mtime = (): string => props.entry.mtime ?? "";
  switch (props.col.key) {
    case "name":
      return (
        <YoColCell class="yohu-files__name">
          <YoFileIcon name={props.entry.name} kind={props.entry.kind} size={Layout.IconSm} />
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

function FileRow(props: { item: RemoteEntry; index: number }) {
  const bind = useContext(FileTableBind);
  const entry = (): RemoteEntry => props.item;
  return (
    <YoColTrack
      class="yohu-files__cols yohu-files__row"
      classList={{ "yohu-files__row--drop": bind?.dropDirName() === entry().name }}
      data-kind={entry().kind}
      draggable="true"
      onDragStart={(event) => {
        event.preventDefault();
        if (!fileStore.selectedSet().has(entry().name)) fileStore.select(entry().name, "replace");
        void fileStore.dragOut(entry().name);
      }}
      onDblClick={() => {
        const current = entry();
        if (current.kind === "dir" || current.kind === "symlink") void fileStore.enterDirectory(current.name);
      }}
    >
      <For each={FILE_COLUMN_LIST}>{(col) => <FileCell entry={entry()} col={col} />}</For>
    </YoColTrack>
  );
}

export function FileTable(props: { onContextMenu: (x: number, y: number) => void; dropDirName?: string | null }) {
  const colTemplate = (): string => fileColTemplate(fileStore.ui.colWidths);
  const entries = (): RemoteEntry[] => fileStore.entries;

  return (
    <YoColFrame class="yohu-files__table" template={colTemplate()}>
      <YoColRow class="yohu-files__cols yohu-files__cols--head">
        <For each={FILE_COLUMN_LIST}>{(col) => <ColHead col={col} />}</For>
      </YoColRow>
      <div
        class="yohu-files__table-list"
        onContextMenu={(event) => {
          event.preventDefault();
          fileStore.clearSelection();
          props.onContextMenu(event.clientX, event.clientY);
        }}
      >
        <Show
          when={entries().length > 0}
          fallback={
            <Show
              when={fileStore.session.loading}
              fallback={<YoEmptyState fill icon="folder" title="此文件夹为空" />}
            >
              <YoLoading fill title="加载中" description="正在读取目录" />
            </Show>
          }
        >
          <FileTableBind.Provider value={{ dropDirName: () => props.dropDirName }}>
            <YoVirtualList<RemoteEntry>
              items={entries}
              itemHeight={controlRowHeight()}
              tone="list"
              getItemKey={(entry) => entry.name}
              ariaLabel="文件列表"
              selectedKeys={fileStore.selectedSet}
              onSelectRow={(entry, _key, event) => {
                fileStore.select(entry.name, pointerSelectMode(event));
              }}
              onRowContextMenu={(entry, _key, event) => {
                if (!fileStore.selectedSet().has(entry.name)) fileStore.select(entry.name, "replace");
                props.onContextMenu(event.clientX, event.clientY);
              }}
              renderRow={FileRow}
            />
          </FileTableBind.Provider>
        </Show>
      </div>
    </YoColFrame>
  );
}
