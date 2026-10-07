/**
 * 命令库栏：标题行 YoSearch 入口，栏下折叠搜索栏。
 * 过滤在 search.ts；树只画结果。
 */

import { createMemo, createSignal } from "solid-js";

import { panelHotEdge, YoPanel, YoScroller, YoSearch } from "@yohu/ui";
import type { LibraryEntryDto } from "@yohu/api";

import { CommandTree, libraryGroupKey } from "./CommandTree";
import { createLibraryDrop } from "./library-drop";
import { filterLibraryGroups, normalizeSearchQuery } from "./search";
import { terminalStore } from "./store";

const LIBRARY_SEARCH_ID = "yohu-terminal-library-search";

function librarySearchPrompt(): string {
  return "搜索命令";
}

export function LibraryPane(props: {
  onNeedValues: (entry: LibraryEntryDto) => void;
  onImportPaths: (paths: string[]) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");
  let paneEl: HTMLDivElement | undefined;
  const drop = createLibraryDrop({
    paneEl: () => paneEl,
    onDrop: props.onImportPaths,
  });

  const groups = createMemo(() => filterLibraryGroups(terminalStore.library.groups, query()));

  return (
    <div class="yohu-terminal__library" ref={paneEl}>
      <YoPanel
        variant="pane"
        padding="sm"
        overflow="hidden"
        edge={panelHotEdge(drop.hot())}
        title="命令库"
        actions={
          <YoSearch
            id={LIBRARY_SEARCH_ID}
            slot="entry"
            collapsible
            open={open()}
            onOpenChange={setOpen}
            value={query()}
            onInput={setQuery}
            title={librarySearchPrompt()}
          />
        }
      >
      <YoSearch
        id={LIBRARY_SEARCH_ID}
        slot="bar"
        collapsible
        open={open()}
        onOpenChange={setOpen}
        value={query()}
        onInput={setQuery}
        ariaLabel={librarySearchPrompt()}
        placeholder={librarySearchPrompt()}
      />
      <YoScroller>
        <CommandTree
          groups={groups()}
          sourceEmpty={terminalStore.library.groups.length === 0}
          expandedKeys={normalizeSearchQuery(query()) ? groups().map((group) => libraryGroupKey(group.id)) : undefined}
          onNeedValues={props.onNeedValues}
        />
      </YoScroller>
      </YoPanel>
    </div>
  );
}
