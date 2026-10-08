import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function load(rel: string): string {
  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), `packages/ui/${rel}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf-8");
  }
  return "";
}

describe("YoTravel binder", () => {
  it("当拍写 used，无 hold / rAF / 观察器 / Dialog 选择器", () => {
    const src = [
      load("src/motion/engines/travel/travel-bind.ts"),
      load("src/motion/engines/travel/travel.tsx"),
      load("src/motion/engines/travel/travel-model.ts"),
      load("src/motion/engines/travel/travel-policy.ts"),
    ].join("\n");
    expect(src).toContain("measureTravelUsed");
    expect(src).toContain('el.style.transition = "none"');
    expect(src).toContain("offsetHeight");
    expect(src).toContain("offsetWidth");
    expect(src).toContain('travel: "used"');
    expect(src).toContain("data-ready");
    expect(src).toContain("YoTravel");
    expect(src).toContain("yohu-travel__slot");
    expect(src).toContain("ctl.command()");
    expect(src).toContain("onTraveling");
    expect(src).toContain("traveling");
    expect(src).toContain("notifyTrip(true)");
    expect(src).not.toContain('"hold"');
    expect(src).not.toMatch(/data-travel["\s=]+hold/);
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("MutationObserver");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
    expect(src).not.toContain("yohu-dialog");
    expect(src).not.toContain("yohu-reveal");
    expect(src).not.toContain("DialogBodyMax");
    expect(src).not.toContain("gridTemplateRows");
    expect(src).not.toContain("YoTravelFit");
    expect(src).not.toContain("fit=");
    expect(src).not.toContain("hug");
  });
});

describe("YoReveal → Travel", () => {
  it("先 snapshot 旧盒，再写布局轴，再 command", () => {
    const src = load("src/motion/engines/travel/reveal.tsx");
    const effect = src.slice(src.indexOf("createRenderEffect(()"));
    const snap = effect.indexOf("travel?.snapshot()");
    const write = effect.indexOf("paintLayout");
    const command = effect.indexOf("travel?.command()");
    expect(src).toContain('root.setAttribute("data-layout"');
    expect(src).toContain("--yohu-reveal-span");
    expect(snap).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(snap);
    expect(command).toBeGreaterThan(write);
    expect(src).not.toContain("data-layout={host()");
  });
});

describe("行程保留用量", () => {
  it("上一拍大于 0 就沿用", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("prev.block > 0 ? prev.block : " + "el.offsetHeight")).toBe(0);
    expect(times("prev.inline > 0 ? prev.inline : " + "el.offsetWidth")).toBe(0);
    expect(times("travelKept(prev.block, el.offsetHeight)")).toBe(1);
    expect(times("travelKept(prev.inline, el.offsetWidth)")).toBe(1);
    expect(times("function travelKept")).toBe(1);
    expect(times("return prev > 0 ? prev : measured")).toBe(1);
    expect(times("to.block > 0 || to.inline > 0")).toBe(1);
  });
});

describe("行程像素", () => {
  it("长度写成 CSS 像素", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("${paint.height}" + "px")).toBe(0);
    expect(times("${paint.width}" + "px")).toBe(0);
    expect(times("${from.block}" + "px")).toBe(0);
    expect(times("${from.inline}" + "px")).toBe(0);
    expect(times("travelCssPx(paint.height)")).toBe(0);
    expect(times("travelCssPx(paint.width)")).toBe(0);
    expect(times("travelCssPx(from.block)")).toBe(0);
    expect(times("travelCssPx(from.inline)")).toBe(0);
    expect(times("function travelCssPx")).toBe(1);
    expect(times("return `${" + "value}px`")).toBe(1);
    expect(body).toContain("function travelKept");
    expect(body).toContain("travelKept(prev.block, el.offsetHeight)");
  });
});

describe("行程锁起点", () => {
  it("起程把起点长度写入尺寸和 max", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.style.height = travelCssPx(" + "from.block)")).toBe(0);
    expect(times("el.style.maxHeight = travelCssPx(" + "from.block)")).toBe(0);
    expect(times("el.style.width = travelCssPx(" + "from.inline)")).toBe(0);
    expect(times("el.style.maxWidth = travelCssPx(" + "from.inline)")).toBe(0);
    expect(body).toContain('travelPinFrom(el, "height", "maxHeight", from.block)');
    expect(body).toContain('travelPinFrom(el, "width", "maxWidth", from.inline)');
    expect(times("function travelPinFrom")).toBe(1);
    expect(times("travelCssPx(px)")).toBe(2);
    expect(body).toContain("function travelCssPx");
    expect(body).toContain('travelPaintAxis(el, "height", paint.height)');
    expect(times("el.style.maxHeight = \"\"")).toBe(0);
    expect(times("el.style.maxWidth = \"\"")).toBe(0);
  });
});

describe("行程轴补丁", () => {
  it("轴开着并且用量大于 0 才写入该轴长度", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("used.block > 0 ? { height: " + "used.block }")).toBe(0);
    expect(times("used.inline > 0 ? { width: " + "used.inline }")).toBe(0);
    expect(body).toContain('travelAxisPatch("height", logicalAxesHaveBlock(next), used.block)');
    expect(body).toContain('travelAxisPatch("width", logicalAxesHaveInline(next), used.inline)');
    expect(times("function travelAxisPatch")).toBe(1);
    expect(times("return on && px > 0 ? { [" + "key]: px } : {}")).toBe(1);
    expect(body).toContain("function travelPinFrom");
    expect(body).toContain('travelPinFrom(el, "height", "maxHeight", from.block)');
    expect(body).toContain('travelDestPatch("height", logicalAxesHaveBlock(next), trip.block?.to, to.block)');
  });
});

describe("行程终点回退", () => {
  it("轴开着写行程终点，缺了回退到刚量到的 to", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("trip.block?.to ?? " + "to.block")).toBe(0);
    expect(times("trip.inline?.to ?? " + "to.inline")).toBe(0);
    expect(body).toContain('travelDestPatch("height", logicalAxesHaveBlock(next), trip.block?.to, to.block)');
    expect(body).toContain('travelDestPatch("width", logicalAxesHaveInline(next), trip.inline?.to, to.inline)');
    expect(times("function travelDestPatch")).toBe(1);
    expect(times("return on ? { [" + "key]: tripTo ?? measured } : {}")).toBe(1);
    expect(body).toContain("function travelAxisPatch");
    expect(body).toContain('travelAxisPatch("height", logicalAxesHaveBlock(next), used.block)');
    expect(times("return on && px > 0")).toBe(1);
  });
});

describe("行程绘制轴", () => {
  it("有长度就把该轴写成 CSS 像素", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("paint.height !== " + "undefined")).toBe(0);
    expect(times("paint.width !== " + "undefined")).toBe(0);
    expect(body).toContain('travelPaintAxis(el, "height", paint.height)');
    expect(body).toContain('travelPaintAxis(el, "width", paint.width)');
    expect(times("function travelPaintAxis")).toBe(1);
    expect(times("travelCssPx(length)")).toBe(1);
    expect(times("travelCssPx(px)")).toBe(2);
    expect(body).toContain("function travelDestPatch");
    expect(body).toContain('travelDestPatch("height", logicalAxesHaveBlock(next), trip.block?.to, to.block)');
  });
});

describe("行程结束属性", () => {
  it("有行程就把属性名记进结束集合", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("if (trip.block) pending.add(" + '"height")')).toBe(0);
    expect(times("if (trip.inline) pending.add(" + '"width")')).toBe(0);
    expect(body).toContain('travelNoteEnd(pending, trip.block, "height")');
    expect(body).toContain('travelNoteEnd(pending, trip.inline, "width")');
    expect(times("function travelNoteEnd")).toBe(1);
    expect(times("if (leg) pending.add(prop)")).toBe(1);
    expect(body).toContain("function travelPaintAxis");
    expect(body).toContain('travelPaintAxis(el, "height", paint.height)');
    expect(times("new Set<string>([])")).toBe(0);
    expect(times("let pending = new Set<string>()")).toBe(1);
    expect(times("pending = new Set<string>()")).toBe(2);
  });
});

describe("行程解开轴", () => {
  it("轴开着就把该轴的内联尺寸清掉", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.style.height = " + '""')).toBe(0);
    expect(times("el.style.width = " + '""')).toBe(0);
    expect(body).toContain('travelUnlock(el, "height", logicalAxesHaveBlock(axes))');
    expect(body).toContain('travelUnlock(el, "width", logicalAxesHaveInline(axes))');
    expect(times("function travelUnlock")).toBe(1);
    expect(times("if (on) el.style[prop] = " + '""')).toBe(1);
    expect(body).toContain("function travelNoteEnd");
    expect(body).toContain('travelNoteEnd(pending, trip.block, "height")');
    expect(times("el.offsetHeight;")).toBe(1);
    expect(times("el.style.maxHeight = \"\"")).toBe(0);
  });
});

describe("行程写回原样", () => {
  it("量完把保存的内联尺寸写回去", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.style.height = " + "keepHeight")).toBe(0);
    expect(times("el.style.width = " + "keepWidth")).toBe(0);
    expect(body).toContain('travelRestore(el, "height", keepHeight)');
    expect(body).toContain('travelRestore(el, "width", keepWidth)');
    expect(times("function travelRestore")).toBe(1);
    expect(times("el.style[prop] = value")).toBe(1);
    expect(body).toContain("function travelUnlock");
    expect(body).toContain('travelUnlock(el, "height", logicalAxesHaveBlock(axes))');
    expect(times("el.offsetHeight;")).toBe(1);
    expect(body).toContain('travelSaved(el, "height")');
  });
});

describe("行程先读原样", () => {
  it("量宿主盒之前先读出该轴当前的内联尺寸", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("const keepHeight = " + "el.style.height")).toBe(0);
    expect(times("const keepWidth = " + "el.style.width")).toBe(0);
    expect(body).toContain('travelSaved(el, "height")');
    expect(body).toContain('travelSaved(el, "width")');
    expect(times("function travelSaved")).toBe(1);
    expect(times("return el.style[prop]")).toBe(1);
    expect(body).toContain("function travelRestore");
    expect(body).toContain('travelRestore(el, "height", keepHeight)');
    expect(times("const keepTransition = el.style.transition")).toBe(1);
    expect(times("el.offsetHeight;")).toBe(1);
  });
});

describe("行程强制回流", () => {
  it("改完内联样式后读一次高度把布局回流做掉", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.offsetHeight;")).toBe(1);
    expect(times("travelFlush(el)")).toBe(3);
    expect(times("function travelFlush")).toBe(1);
    expect(body).toContain("block: el.offsetHeight");
    expect(body).toContain("travelKept(prev.block, el.offsetHeight)");
    expect(body).toContain("function travelSaved");
    expect(body).toContain('travelSaved(el, "height")');
  });
});

describe("行程清掉最大", () => {
  it("起点锁上之后把纵轴和横轴的 max 清成空字符串", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.style.maxHeight = " + '""')).toBe(0);
    expect(times("el.style.maxWidth = " + '""')).toBe(0);
    expect(body).toContain('travelClearMax(el, "maxHeight")');
    expect(body).toContain('travelClearMax(el, "maxWidth")');
    expect(times("function travelClearMax")).toBe(1);
    expect(times("el.style[prop] = " + '""')).toBe(2);
    expect(body).toContain("function travelFlush");
    expect(body).toContain("travelFlush(el)");
    expect(times("travelFlush(el)")).toBe(3);
    expect(times("el.style.transition = \"\"")).toBe(1);
  });
});

describe("行程停过渡", () => {
  it("改内联尺寸之前先把过渡设成 none", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("el.style.transition = " + '"none"')).toBe(1);
    expect(times("travelFreeze(el)")).toBe(2);
    expect(times("function travelFreeze")).toBe(1);
    expect(times("el.style.transition = keepTransition")).toBe(1);
    expect(times("el.style.transition = " + '""')).toBe(1);
    expect(body).toContain("function travelClearMax");
    expect(body).toContain('travelClearMax(el, "maxHeight")');
  });
});

describe("行程读宿主盒", () => {
  it("量盒和收尾都从同一份宿主盒读出纵轴和横轴", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("block: el.offsetHeight")).toBe(1);
    expect(times("inline: el.offsetWidth")).toBe(1);
    expect(times("travelBox(el)")).toBe(2);
    expect(times("function travelBox")).toBe(1);
    expect(body).toContain("travelKept(prev.block, el.offsetHeight)");
    expect(times("travelKept(prev.block, el.offsetHeight)")).toBe(1);
    expect(body).toContain("function travelFlush");
    expect(body).toContain("el.offsetHeight;");
    expect(times("el.offsetHeight;")).toBe(1);
    expect(body).toContain("function travelFreeze");
  });
});

describe("行程沿用盒", () => {
  it("快照和起程回退都走同一份沿用盒", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "travel-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("travelKept(prev.block, el.offsetHeight)")).toBe(1);
    expect(times("travelKept(prev.inline, el.offsetWidth)")).toBe(1);
    expect(times("travelHeld(el, prev)")).toBe(2);
    expect(times("function travelHeld")).toBe(1);
    expect(body).toContain("function travelKept");
    expect(body).toContain("function travelBox");
    expect(times("travelBox(el)")).toBe(2);
  });
});
