/** Unicode 标量扫描。不进模块公开面。 */

export function loweredChars(text: string): string[] {
  return [...text.toLowerCase()];
}

export function findChars(hay: readonly string[], needle: readonly string[], from: number): number | null {
  if (needle.length === 0) return Math.min(from, hay.length);
  if (needle.length > hay.length) return null;
  const last = hay.length - needle.length;
  for (let i = from; i <= last; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return null;
}
