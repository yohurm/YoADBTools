/** 查询归一与空白分词。连字符 / 点号不拆。 */

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function tokenizeSearchQuery(query: string): string[] {
  const needle = normalizeSearchQuery(query);
  if (!needle) return [];
  return needle.split(/\s+/).filter((token) => token.length > 0);
}
