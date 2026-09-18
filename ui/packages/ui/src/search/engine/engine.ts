import { searchDocuments } from "./query";
import type { SearchDocument, SearchEngine } from "./types";

/** 冻结一份文档表。后续 search 不回看调用方数组。 */
export function createSearchEngine<T>(docs: readonly SearchDocument<T>[]): SearchEngine<T> {
  const snapshot = docs.slice();
  return {
    search: (query, options) => searchDocuments(snapshot, query, options),
  };
}
