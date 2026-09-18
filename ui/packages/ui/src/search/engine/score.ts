import type { SearchField, SearchHitKind } from "./types";

export const SEARCH_KIND_SCORE: Record<SearchHitKind, number> = {
  exact: 100,
  prefix: 40,
  contains: 10,
};

export const DEFAULT_SEARCH_FIELD_WEIGHT = 1;

export function kindScore(kind: SearchHitKind): number {
  return SEARCH_KIND_SCORE[kind];
}

export function fieldWeight(field: SearchField): number {
  const weight = field.weight;
  if (typeof weight !== "number" || !Number.isFinite(weight)) return DEFAULT_SEARCH_FIELD_WEIGHT;
  return weight > 0 ? weight : 0;
}

export function scoreKind(kind: SearchHitKind, weight: number): number {
  if (weight <= 0) return 0;
  return kindScore(kind) * weight;
}
