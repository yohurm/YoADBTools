/**
 * 从 mozillazg/pinyin-data 生成 yohu-search / YoSearch 共用音节表。
 * 用法：node scripts/gen-pinyin-table.mjs [pinyin.txt]
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = process.argv[2];
if (!SOURCE) {
  console.error("usage: node scripts/gen-pinyin-table.mjs <pinyin.txt>");
  process.exit(1);
}

const TONE = {
  ā: "a",
  á: "a",
  ǎ: "a",
  à: "a",
  ē: "e",
  é: "e",
  ě: "e",
  è: "e",
  ê: "e",
  ế: "e",
  ề: "e",
  ī: "i",
  í: "i",
  ǐ: "i",
  ì: "i",
  ō: "o",
  ó: "o",
  ǒ: "o",
  ò: "o",
  ū: "u",
  ú: "u",
  ǔ: "u",
  ù: "u",
  ü: "v",
  ǖ: "v",
  ǘ: "v",
  ǚ: "v",
  ǜ: "v",
  ń: "n",
  ň: "n",
  ǹ: "n",
  ḿ: "m",
};

function stripTone(raw) {
  const mapped = [...raw.replaceAll("u:", "v")].map((ch) => TONE[ch] ?? ch).join("");
  return mapped
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

const bySyllable = new Map();
let chars = 0;
let readings = 0;

for (const line of readFileSync(SOURCE, "utf8").split(/\r?\n/)) {
  const match = /^U\+([0-9A-Fa-f]+):\s*([^\s#]+)/.exec(line);
  if (!match) continue;
  const ch = String.fromCodePoint(Number.parseInt(match[1], 16));
  const seen = new Set();
  for (const part of match[2].split(",")) {
    const syl = stripTone(part.trim());
    if (!/^[a-z]+$/.test(syl) || seen.has(syl)) continue;
    seen.add(syl);
    const bucket = bySyllable.get(syl) ?? [];
    bucket.push(ch);
    bySyllable.set(syl, bucket);
    readings += 1;
  }
  if (seen.size > 0) chars += 1;
}

const syllables = [...bySyllable.keys()].sort();
const body = syllables
  .map((syl) => {
    const unique = [...new Set(bySyllable.get(syl))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
    return `${syl}\t${unique.join("")}`;
  })
  .join("\n");

const tsv = [
  "# yohu-search pinyin table",
  "# source: mozillazg/pinyin-data 0.15.0 (MIT) https://github.com/mozillazg/pinyin-data",
  "# ü → v；去声调。勿手改，用 scripts/gen-pinyin-table.mjs",
  body,
  "",
].join("\n");

const rustPath = resolve(ROOT, "core/yohu-search/data/pinyin.tsv");
const tsPath = resolve(ROOT, "ui/packages/ui/src/search/engine/pinyin-table.ts");
mkdirSync(dirname(rustPath), { recursive: true });
writeFileSync(rustPath, tsv);
writeFileSync(
  tsPath,
  [
    "/** Generated from mozillazg/pinyin-data 0.15.0 (MIT). 勿手改，用 scripts/gen-pinyin-table.mjs */",
    `export const PINYIN_TSV = ${JSON.stringify(tsv)};`,
    "",
  ].join("\n"),
);

console.log(`wrote ${syllables.length} syllables, ${chars} chars, ${readings} readings`);
console.log(rustPath);
console.log(tsPath);
