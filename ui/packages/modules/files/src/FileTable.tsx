/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，状态全在 fileStore。
 * 轨道走 YoColFrame；表头 YoColRow / YoColHeader；行 YoColTrack / YoColCell。
 */

import { For, Show } from "solid-js";

import {
  YoColCell,
  YoColFrame,
  YoColHeader,
  YoColRow,
  YoColTrack,
  YoEmptyState,
  YoFileIcon,
  YoLoading,
  YoVirtualList,
  YoTooltip,
  pointerSelectMode,
} from "@yohu/ui";
import type { RemoteEntry } from "@yohu/api";

import {
  FILE_COLUMNS,
  fileColTemplate,
  fileTypeLabel,
  formatSize,
  type FileColumnSpec,
} from "./model";

/** 文件列表行高（px，功能配置；YoVirtualList 行高）。 */
const FILE_ROW_HEIGHT = 28;
import { fileStore } from "./store";

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
      tooltip={props.col.sortTitle}
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
          <YoFileIcon name={props.entry.name} kind={props.entry.kind} size={16} />
          <YoTooltip content={props.entry.name}>
            <span class="yohu-files__name-text">{props.entry.name}</span>
          </YoTooltip>
        </YoColCell>
      );
    case "type":
      return (
        <YoTooltip content={type()}>
          <YoColCell class="yohu-files__cell">{type()}</YoColCell>
        </YoTooltip>
      );
    case "size":
      return (
        <YoTooltip content={size()} disabled={!size()}>
          <YoColCell class="yohu-files__num">{size()}</YoColCell>
        </YoTooltip>
      );
    case "mtime":
      return (
        <YoTooltip content={props.entry.mtime ?? ""} disabled={!props.entry.mtime}>
          <YoColCell class="yohu-files__mtime">{mtime()}</YoColCell>
        </YoTooltip>
      );
  }
}

export function FileTable(props: { onContextMenu: (x: number, y: number) => void; dropDirName?: string | null }) {
  const colTemplate = (): string => fileColTemplate(fileStore.ui.colWidths);
  const entries = (): RemoteEntry[] => fileStore.entries;

  return (
    <YoColFrame class="yohu-files__table" template={colTemplate()}>
      <YoColRow class="yohu-files__cols yohu-files__cols--head">
        <For each={[...FILE_COLUMNS]}>{(col) => <ColHead col={col} />}</For>
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
          <YoVirtualList<RemoteEntry>
            items={entries}
            itemHeight={FILE_ROW_HEIGHT}
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
            renderRow={(entry) => (
              <YoColTrack
                class="yohu-files__cols yohu-files__row"
                classList={{ "yohu-files__row--drop": props.dropDirName === entry.name }}
                data-kind={entry.kind}
                draggable="true"
                onDragStart={(event) => {
                  event.preventDefault();
                  if (!fileStore.selectedSet().has(entry.name)) fileStore.select(entry.name, "replace");
                  void fileStore.dragOut(entry.name);
                }}
                onDblClick={() => {
                  if (entry.kind === "dir" || entry.kind === "symlink") void fileStore.enterDirectory(entry.name);
                }}
              >
                <For each={[...FILE_COLUMNS]}>{(col) => <FileCell entry={entry} col={col} />}</For>
              </YoColTrack>
            )}
          />
        </Show>
      </div>
    </YoColFrame>
  );
}
