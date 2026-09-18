/**
 * 命令库栏：标题行 YoSearch 入口，栏下折叠搜索栏。
 * 过滤在 search.ts；树只画结果。
 */

import { createMemo, createSignal } from "solid-js";

import { YoPanel, YoScroller, YoSearch } from "@yohu/ui";
import type { LibraryEntryDto } from "@yohu/api";

import { CommandTree } from "./CommandTree";
import { filterLibraryGroups, normalizeSearchQuery } from "./search";
import { terminalStore } from "./store";

const LIBRARY_SEARCH_ID = "yohu-terminal-library-search";

export function LibraryPane(props: { onNeedValues: (entry: LibraryEntryDto) => void }) {
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal("");

  const groups = createMemo(() => filterLibraryGroups(terminalStore.library.groups, query()));

  return (
    <YoPanel
      variant="pane"
      padding="sm"
      overflow="hidden"
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
          title="搜索命令"
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
        ariaLabel="搜索命令"
        placeholder="搜索命令"
      />
      <YoScroller>
        <CommandTree
          groups={groups()}
          sourceEmpty={terminalStore.library.groups.length === 0}
          expandedKeys={normalizeSearchQuery(query()) ? groups().map((group) => `g:${group.id}`) : undefined}
          onNeedValues={props.onNeedValues}
        />
      </YoScroller>
    </YoPanel>
  );
}
