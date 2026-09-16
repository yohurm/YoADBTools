import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BARREL_CANDIDATES = [
  resolve(process.cwd(), "src/tokens/motion.css"),
  resolve(process.cwd(), "packages/ui/src/tokens/motion.css"),
];

const IMPORT_RE = /@import\s+["']([^"']+)["']\s*;/;

function readResolved(file: string, seen: Set<string>): string {
  const real = resolve(file);
  if (seen.has(real)) return "";
  seen.add(real);
  if (!existsSync(real)) return "";
  const text = readFileSync(real, "utf-8");
  const dir = dirname(real);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const match = IMPORT_RE.exec(line.trim());
      if (!match) return line;
      return readResolved(resolve(dir, match[1]), seen);
    })
    .join("\n");
}

/** 展开 `tokens/motion.css` 的 @import，给配方契约测试用。 */
export function loadMotionCss(): string {
  for (const candidate of BARREL_CANDIDATES) {
    if (existsSync(candidate)) return readResolved(candidate, new Set());
  }
  return "";
}

const LAYER_ROOTS = [
  resolve(process.cwd(), "src/motion"),
  resolve(process.cwd(), "packages/ui/src/motion"),
];

/** 读一层实现 CSS，禁止再靠整桶切片。 */
export function loadMotionLayerCss(relFromMotion: string): string {
  for (const root of LAYER_ROOTS) {
    const file = resolve(root, relFromMotion);
    if (existsSync(file)) return readFileSync(file, "utf-8");
  }
  return "";
}
