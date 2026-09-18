/** 检索引擎公开类型。不含产品文档形状。 */

export type SearchHitKind = "exact" | "prefix" | "contains";

export type SearchCombine = "and" | "or";

export type SearchEmpty = "pass" | "none";

export interface SearchField {
  key: string;
  text: string;
  /** 缺省 1。≤0 仍可命中，不计分。 */
  weight?: number;
}

export interface SearchDocument<T = unknown> {
  id: string;
  item?: T;
  fields: readonly SearchField[];
  group?: string;
}

export interface SearchHit {
  field: string;
  start: number;
  end: number;
  kind: SearchHitKind;
}

export interface SearchRange {
  start: number;
  end: number;
}

export interface SearchMatch<T = unknown> {
  id: string;
  item?: T;
  score: number;
  hits: SearchHit[];
  group?: string;
  index: number;
}

export interface SearchOptions {
  combine?: SearchCombine;
  empty?: SearchEmpty;
}

export interface SearchEngine<T = unknown> {
  search: (query: string, options?: SearchOptions) => SearchMatch<T>[];
}
