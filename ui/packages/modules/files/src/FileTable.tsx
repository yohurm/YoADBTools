/**
 * 文件表（View）：列规格来自 model.FILE_COLUMNS，状态全在 fileStore。
 * 轨道走 YoColFrame；表头 YoColRow / YoColHeader；行 YoColTrack / YoColCell。
 */

import { For, Show } from "solid-js";

import {
  Icon,
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

import {
  FILE_COLUMNS,
  fileColTemplate,
  fileTypeLabel,
  formatMtime,
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
      ariaSort={ariaSort()}
      resizable={!props.col.flex}
      resizeLabel={props.col.resizeLabel}
      width={fileStore.ui.colWidths[props.col.key] ?? props.col.defaultWidth}
      minWidth={props.col.minWidth}
      onWidthChange={(width) => fileStore.setColWidth(props.col.key, width)}
    >
      <button
        type="button"
        class="yohu-files__sort yohu-interactive yohu-focus-ring--inset"
        onClick={() => fileStore.setSort(props.col.key)}
        title={props.col.sortTitle}
      >
        <span class="yohu-col-header__label">
          <span class="yohu-files__sort-label">{props.col.header}</span>
          <Show when={ariaSort() !== "none"}>
            <span class="yohu-files__sort-icon" aria-hidden="true">
              <Icon name={ariaSort() === "ascending" ? "chevron-up" : "chevron-down"} size={12} />
            </span>
          </Show>
        </span>
      </button>
    </YoColHeader>
  );
}

function FileCell(props: { entry: RemoteEntry; col: FileColumnSpec }) {
  const type = (): string => fileTypeLabel(props.entry);
  const size = (): string => (props.entry.kind === "file" ? formatSize(props.entry.size) : "");
  const mtime = (): string => formatMtime(props.entry.mtime);
  switch (props.col.key) {
    case "name":
      return (
        <YoColCell class="yohu-files__name">
          <YoFileIcon name={props.entry.name} kind={props.entry.kind} size={16} />
          <span class="yohu-files__name-text" title={props.entry.name}>
            {props.entry.name}
          </span>
        </YoColCell>
      );
    case "type":
      return (
        <YoColCell class="yohu-files__cell" title={type()}>
          {type()}
        </YoColCell>
      );
    case "size":
      return (
        <YoColCell class="yohu-files__num" title={size()}>
          {size()}
        </YoColCell>
      );
    case "mtime":
      return (
        <YoColCell class="yohu-files__mtime" title={props.entry.mtime ?? ""}>
          {mtime()}
        </YoColCell>
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
          if ((event.target as HTMLElement).closest(".yohu-virtual-list__row")) return;
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
              fallback={<YoEmptyState icon="folder" title="此文件夹为空" />}
            >
              <YoLoading title="加载中" description="正在读取目录" />
            </Show>
          }
        >
          <YoVirtualList<RemoteEntry>
            items={entries}
            itemHeight={FILE_ROW_HEIGHT}
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
