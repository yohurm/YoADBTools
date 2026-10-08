import { Show } from "solid-js";

import { Layout, YoDescriptionList, YoEmptyState, YoFileIcon, YoIconButton, YoPanel, YoScroller } from "@yohu/ui";

import { listingStore } from "./listing";
import { entryOpensAsDir, entrySizeText, fileColumnHeader, fileTypeLabel } from "./model";
import { PREVIEW_COLLAPSE, PREVIEW_TITLE, previewEmptyDetail } from "./preview-label";

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
      title={PREVIEW_TITLE}
      aria-label={PREVIEW_TITLE}
      actions={<YoIconButton icon="close" title={PREVIEW_COLLAPSE} onClick={() => listingStore.togglePreview()} />}
    >
      <YoScroller>
        <Show
          when={preview()}
          fallback={<YoEmptyState fill size="sm" icon="folder" title="选择一个项目以预览" />}
        >
          {(entry) => (
            <div class="yohu-files__preview-body">
              <YoFileIcon name={entry().name} folder={entryOpensAsDir(entry().kind)} size={Layout.IconPreview} />
              <div class="yohu-files__preview-name">{entry().name}</div>
              <YoDescriptionList
                items={[
                  { term: fileColumnHeader("type"), detail: fileTypeLabel(entry()) },
                  { term: fileColumnHeader("size"), detail: entrySizeText(entry().kind, entry().size, previewEmptyDetail()) },
                  { term: "修改时间", detail: entry().mtime || previewEmptyDetail() },
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
