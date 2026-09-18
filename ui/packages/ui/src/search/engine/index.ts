/**
 * YoSearch 引擎层。与 core/yohu-search 同一套 testdata/search.json + data/pinyin.tsv。
 * 不碰 DOM、不写色。`pinyin` 不进公开面。
 */

export type {
  SearchCombine,
  SearchDocument,
  SearchEmpty,
  SearchEngine,
  SearchField,
  SearchHit,
  SearchHitKind,
  SearchMatch,
  SearchOptions,
  SearchRange,
} from "./types";
export { normalizeSearchQuery, tokenizeSearchQuery } from "./token";
export { searchFieldHit } from "./field";
export { DEFAULT_SEARCH_FIELD_WEIGHT, SEARCH_KIND_SCORE } from "./score";
export { searchDocuments } from "./query";
export { expandSearchGroups } from "./expand";
export type { ExpandSearchGroupsOptions } from "./expand";
export { mergeSearchRanges, searchHighlightRanges } from "./highlight";
export { createSearchEngine } from "./engine";
