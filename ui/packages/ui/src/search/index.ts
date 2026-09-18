/**
 * YoSearch 模块公开面。
 * 引擎在 `engine/`；铬在本目录（policy / Search）。
 * L5 只转发本文件。
 */

export {
  createSearchEngine,
  expandSearchGroups,
  mergeSearchRanges,
  normalizeSearchQuery,
  searchDocuments,
  searchFieldHit,
  searchHighlightRanges,
  tokenizeSearchQuery,
  DEFAULT_SEARCH_FIELD_WEIGHT,
  SEARCH_KIND_SCORE,
} from "./engine";
export type {
  ExpandSearchGroupsOptions,
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
} from "./engine";

export { YoSearch } from "./Search";
export type { YoSearchCancel, YoSearchControl, YoSearchProps, YoSearchSlot, YoSearchStatus } from "./Search";
export {
  resolveSearchActive,
  resolveSearchCancel,
  resolveSearchOpen,
  resolveSearchSlot,
  resolveSearchStatus,
  resolveSearchWidth,
  searchEntryPressed,
  searchHostAttrs,
  searchPaintKind,
  searchShowClear,
  searchShowsBar,
  searchShowsEntry,
} from "./search-policy";
export type {
  SearchHostAttrs,
  SearchHostInput,
  SearchPaintKind,
  SearchWidthKind,
} from "./search-policy";
