import { searchFieldHit } from "./field";
import { fieldWeight, scoreKind } from "./score";
import { tokenizeSearchQuery } from "./token";
import type { SearchCombine, SearchDocument, SearchHit, SearchMatch, SearchOptions } from "./types";

function matchDocument<T>(
  doc: SearchDocument<T>,
  tokens: readonly string[],
  index: number,
  combine: SearchCombine,
): SearchMatch<T> | null {
  if (tokens.length === 0) {
    return { id: doc.id, item: doc.item, score: 0, hits: [], group: doc.group, index };
  }
  const hits: SearchHit[] = [];
  let score = 0;
  let covered = 0;
  for (const token of tokens) {
    let best = 0;
    let matched = false;
    for (const field of doc.fields) {
      const hit = searchFieldHit(field.text, token);
      if (!hit) continue;
      matched = true;
      hits.push({ ...hit, field: field.key });
      best = Math.max(best, scoreKind(hit.kind, fieldWeight(field)));
    }
    if (matched) {
      covered += 1;
      score += best;
    }
  }
  if (covered === 0) return null;
  if (combine === "and" && covered < tokens.length) return null;
  return { id: doc.id, item: doc.item, score, hits, group: doc.group, index };
}

function emptyMatches<T>(docs: readonly SearchDocument<T>[]): SearchMatch<T>[] {
  return docs.map((doc, index) => ({
    id: doc.id,
    item: doc.item,
    score: 0,
    hits: [],
    group: doc.group,
    index,
  }));
}

export function searchDocuments<T>(
  docs: readonly SearchDocument<T>[],
  query: string,
  options: SearchOptions = {},
): SearchMatch<T>[] {
  const tokens = tokenizeSearchQuery(query);
  const empty = options.empty ?? "pass";
  if (tokens.length === 0) return empty === "none" ? [] : emptyMatches(docs);
  const combine = options.combine ?? "and";
  const out: SearchMatch<T>[] = [];
  docs.forEach((doc, index) => {
    const match = matchDocument(doc, tokens, index, combine);
    if (match) out.push(match);
  });
  out.sort((a, b) => b.score - a.score || a.index - b.index);
  return out;
}
