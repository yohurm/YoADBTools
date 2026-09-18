/**
 * 命令库检索：只过滤展示，不改库。
 * 引擎走 YoSearch 公开面；本组只把 DTO 编成文档，组名字段命中保留整组。
 */

import type { CommandGroupDto, LibraryEntryDto } from "@yohu/api";
import {
  expandSearchGroups,
  normalizeSearchQuery,
  searchDocuments,
  type SearchDocument,
} from "@yohu/ui";

export { normalizeSearchQuery };

export type LibrarySearchItem = {
  groupId: string;
  entry: LibraryEntryDto;
};

function entryTemplateText(entry: LibraryEntryDto): string {
  return entry.kind === "command" ? entry.template : entry.steps.map((step) => step.template).join("\n");
}

export function librarySearchDocuments(
  groups: readonly CommandGroupDto[],
): SearchDocument<LibrarySearchItem>[] {
  const docs: SearchDocument<LibrarySearchItem>[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      docs.push({
        id: entry.id,
        item: { groupId: group.id, entry },
        group: group.id,
        fields: [
          { key: "name", text: entry.name, weight: 3 },
          { key: "template", text: entryTemplateText(entry), weight: 1 },
          { key: "group", text: group.name, weight: 2 },
        ],
      });
    }
  }
  return docs;
}

export function entryMatchesQuery(entry: LibraryEntryDto, query: string, groupName = ""): boolean {
  const docs = librarySearchDocuments([{ id: "_", name: groupName, entries: [entry] }]);
  return searchDocuments(docs, query, { empty: "pass" }).length > 0;
}

export function filterLibraryGroups(
  groups: readonly CommandGroupDto[],
  query: string,
): CommandGroupDto[] {
  if (!normalizeSearchQuery(query)) return [...groups];
  const docs = librarySearchDocuments(groups);
  const matches = expandSearchGroups(docs, searchDocuments(docs, query, { empty: "none" }));
  const byGroup = new Map<string, LibraryEntryDto[]>();
  for (const match of matches) {
    const item = match.item;
    if (!item) continue;
    const list = byGroup.get(item.groupId) ?? [];
    list.push(item.entry);
    byGroup.set(item.groupId, list);
  }
  const out: CommandGroupDto[] = [];
  for (const group of groups) {
    const entries = byGroup.get(group.id);
    if (entries && entries.length > 0) out.push({ ...group, entries });
  }
  return out;
}
