/**
 * YoUI 独立与族谱纪律：
 * - 产品 Yo* 按 HarmonyOS 族目录存放，禁止再堆 components/
 * - 容器 / 产品视图不得跨族 import 产品 Yo*（bindPopup 例外见 youi-families）
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  ALLOWED_CROSS,
  CONTAINER_VIEWS,
  PRODUCT_FAMILIES,
  familyOfFile,
  fileStem,
} from "./youi-families.mjs";

const UI_SRC = resolve(import.meta.dirname, "../ui/packages/ui/src");
const CROSS_IMPORT = /from\s+["']\.\.\/(basic|blank|form|display|container|grid|scroll|list|navigation|overlay|feedback|chrome)\/([^"']+)["']/g;

let failed = false;

function fail(msg) {
  console.error(msg);
  failed = true;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const leftover = join(UI_SRC, "components");
try {
  if (statSync(leftover).isDirectory() && walk(leftover).length > 0) {
    fail("禁止残留 ui/packages/ui/src/components/：产品件须按族目录存放");
  }
} catch {
  /* 已拆除 */
}

for (const family of PRODUCT_FAMILIES) {
  const dir = join(UI_SRC, family);
  if (!statSync(dir).isDirectory()) {
    fail(`缺少族目录 ${family}/`);
    continue;
  }
}

for (const file of walk(UI_SRC)) {
  const rel = relative(UI_SRC, file).replaceAll("\\", "/");
  if (!/\.(ts|tsx)$/.test(rel) || rel.includes(".test.")) continue;
  const parts = rel.split("/");
  const family = parts[0];
  if (!PRODUCT_FAMILIES.includes(family)) continue;
  if (parts.length !== 2) continue;

  const text = readFileSync(file, "utf8");
  const expected = familyOfFile(parts[1]);
  if (expected && expected !== family) {
    fail(`${rel}: 文件族应为 ${expected}，现位于 ${family}/`);
  }

  if (rel.endsWith(".tsx") && CONTAINER_VIEWS.has(rel)) {
    if (/\bfrom\s+["']\.\/(Subheader|Scroller|Badge|Tooltip|IconButton)["']/.test(text)) {
      fail(`${rel}: 容器不得同目录 import 产品 Yo*，改为调用方槽位组合`);
    }
    if (/\bYo(Subheader|Scroller|Badge|Tooltip|IconButton)\b/.test(text) && /from\s+["']\.\.\//.test(text)) {
      const yoFromOther = [...text.matchAll(CROSS_IMPORT)];
      for (const match of yoFromOther) {
        fail(`${rel}: 容器跨族引用 ${match[1]}/${match[2]}`);
      }
    }
  }

  CROSS_IMPORT.lastIndex = 0;
  for (const match of text.matchAll(CROSS_IMPORT)) {
    const destFamily = match[1];
    const spec = match[2].replace(/\/.*$/, "");
    const destPath = `${destFamily}/${spec}`;
    const allowed = ALLOWED_CROSS[rel] ?? [];
    if (allowed.includes(destPath)) continue;
    if (destFamily === family) continue;
    const destStem = fileStem(spec);
    const looksView = /^[A-Z]/.test(destStem) || destStem === "chrome";
    if (looksView) {
      fail(`${rel}: 禁止跨族 import ${destFamily}/${spec}（对照 HarmonyOS：容器只开槽，调用方组合 Yo*）`);
    }
  }

}

const NO_NATIVE_BAR = [
  ["container/Panel.css", /overflow-[xy]\s*:\s*auto/],
  ["container/Panel.tsx", /from\s+["'][^"']*Scroller["']/],
  ["container/Toolbar.css", /overflow-x\s*:\s*auto/],
  ["overlay/Dialog.css", /\.yohu-dialog__body[^{]*\{[^}]*overflow-y\s*:\s*auto/],
  ["overlay/Dialog.tsx", /from\s+["'][^"']*Scroller["']/],
];
for (const [rel, re] of NO_NATIVE_BAR) {
  const text = readFileSync(join(UI_SRC, rel), "utf8");
  if (re.test(text)) fail(`${rel}: 容器禁止系统条 / 禁止 import YoScroller`);
}

if (failed) process.exit(1);
console.log("check-youi-independence: ok");
