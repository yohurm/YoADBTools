import { Show } from "solid-js";

import { Layout, YoDescriptionList, YoEmptyState, YoFileIcon, YoIconButton, YoPanel, YoScroller } from "@yohu/ui";

import { listingStore } from "./listing";
import { fileTypeLabel, formatSize } from "./model";

/** 独立预览分区：YoPanel overflow=hidden + YoScroller + YoDescriptionList。 */
export function PreviewPane() {
  const preview = () => {
    const list = listingStore.selectedEntries();
    return list.length === 1 ? list[0] : undefined;
  };

  return (
    <YoPanel
      variant="pane"
      class="yohu-files__preview"
      overflow="hidden"
      title="预览"
      aria-label="预览"
      actions={<YoIconButton icon="close" title="收起预览" onClick={() => listingStore.togglePreview()} />}
    >
      <YoScroller class="yohu-files__preview-scroll">
        <Show
          when={preview()}
          fallback={<YoEmptyState fill size="sm" icon="folder" title="选择一个项目以预览" />}
        >
          {(entry) => (
            <div class="yohu-files__preview-body">
              <YoFileIcon name={entry().name} kind={entry().kind} size={Layout.IconPreview} />
              <div class="yohu-files__preview-name">{entry().name}</div>
              <YoDescriptionList
                items={[
                  { term: "类型", detail: fileTypeLabel(entry()) },
                  { term: "大小", detail: entry().kind === "file" ? formatSize(entry().size) : "—" },
                  { term: "修改时间", detail: entry().mtime || "—" },
                  { term: "权限", detail: entry().permission },
                ]}
              />
            </div>
          )}
        </Show>
      </YoScroller>
    </YoPanel>
  );
}
