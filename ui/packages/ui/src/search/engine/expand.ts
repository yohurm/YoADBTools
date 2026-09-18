import type { SearchDocument, SearchMatch } from "./types";

export interface ExpandSearchGroupsOptions {
  groupField?: string;
}

/** 组名字段命中则纳入同 group 的全部文档。输出按源序。 */
export function expandSearchGroups<T>(
  docs: readonly SearchDocument<T>[],
  matches: readonly SearchMatch<T>[],
  options: ExpandSearchGroupsOptions = {},
): SearchMatch<T>[] {
  const groupField = options.groupField ?? "group";
  const byId = new Map(matches.map((match) => [match.id, match]));
  const keep = new Set(matches.map((match) => match.id));
  const expand = new Set<string>();
  for (const match of matches) {
    if (!match.group) continue;
    if (match.hits.some((hit) => hit.field === groupField)) expand.add(match.group);
  }
  if (expand.size > 0) {
    docs.forEach((doc, index) => {
      if (doc.group && expand.has(doc.group)) {
        keep.add(doc.id);
        if (!byId.has(doc.id)) {
          byId.set(doc.id, { id: doc.id, item: doc.item, score: 0, hits: [], group: doc.group, index });
        }
      }
    });
  }
  return docs
    .map((doc, index) => {
      if (!keep.has(doc.id)) return null;
      return byId.get(doc.id) ?? { id: doc.id, item: doc.item, score: 0, hits: [], group: doc.group, index };
    })
    .filter((match): match is SearchMatch<T> => match != null);
}
