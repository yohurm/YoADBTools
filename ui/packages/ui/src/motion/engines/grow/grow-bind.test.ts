import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { measureGrowUsed, readGrowLock } from "./grow-bind";

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

describe("YoGrow binder", () => {
  it("当拍写 height，无 hold / rAF / 观察器 / Travel 双轨", () => {
    const src = [
      load("src/motion/engines/grow/grow-bind.ts"),
      load("src/motion/engines/grow/grow.tsx"),
      load("src/motion/engines/grow/grow-model.ts"),
      load("src/motion/engines/grow/grow-policy.ts"),
    ].join("\n");
    expect(src).toContain("measureGrowUsed");
    expect(src).toContain("el.animate");
    expect(src).toContain("fill: \"forwards\"");
    expect(src).toContain("writeHeight");
    expect(src).toContain("data-ready");
    expect(src).toContain("YoGrow");
    expect(src).toContain("yohu-grow__slot");
    expect(src).toContain("ctl.command()");
    expect(src).toContain("onTraveling");
    expect(src).toContain("tripTo");
    expect(src).toContain("readGrowLock");
    expect(src).toContain("tripId");
    expect(src).toContain("document.timeline");
    expect(src).toContain("GROW_USED_ATTR");
    expect(src).not.toContain("dirty");
    expect(src).not.toContain("frozen");
    expect(src).not.toContain('"hold"');
    expect(src).not.toContain("requestAnimationFrame");
    expect(src).not.toContain("MutationObserver");
    expect(src).not.toContain("ResizeObserver");
    expect(src).not.toMatch(/\.getBoundingClientRect\s*\(/);
    expect(src).not.toContain("yohu-dialog");
    expect(src).not.toContain("yohu-text-field");
    expect(src).toContain("style.height");
    expect(src).not.toContain("minHeight");
    expect(src).not.toContain("maxHeight");
    expect(src).not.toContain("fit");
    expect(src).not.toContain("hug");
    expect(src).not.toContain("降程");
    expect(src).not.toContain("getPropertyValue");
  });
});

describe("measureGrowUsed", () => {
  it("量子盒，不解宿主高", () => {
    const host = document.createElement("div");
    const slot = document.createElement("div");
    const child = document.createElement("div");
    host.append(slot);
    slot.append(child);
    host.style.height = "32px";
    Object.defineProperty(host, "offsetHeight", { configurable: true, value: 32 });
    Object.defineProperty(child, "offsetHeight", { configurable: true, value: 96 });
    expect(measureGrowUsed(host)).toBe(96);
    expect(host.style.height).toBe("32px");
  });

  it("有标记盒时量标记，不量铺满锁行的第一子盒", () => {
    const host = document.createElement("div");
    const slot = document.createElement("div");
    const chrome = document.createElement("div");
    const used = document.createElement("div");
    used.setAttribute("data-grow-used", "");
    host.append(slot);
    slot.append(chrome, used);
    Object.defineProperty(chrome, "offsetHeight", { configurable: true, value: 32 });
    Object.defineProperty(used, "offsetHeight", { configurable: true, value: 96 });
    expect(measureGrowUsed(host)).toBe(96);
  });

  it("锁行读宿主当前高，不是子盒", () => {
    const host = document.createElement("div");
    Object.defineProperty(host, "offsetHeight", { configurable: true, value: 80 });
    expect(readGrowLock(host)).toBe(80);
  });
});

describe("用后高像素", () => {
  it("长度写成 CSS 像素", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "grow-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("${px}" + "px")).toBe(0);
    expect(times("${next.from}" + "px")).toBe(0);
    expect(times("${next.to}" + "px")).toBe(0);
    expect(times("growCssPx(px)")).toBe(1);
    expect(times("growCssPx(next.from)")).toBe(1);
    expect(times("growCssPx(next.to)")).toBe(1);
    expect(times("function growCssPx")).toBe(1);
    expect(times("return `${" + "value}px`")).toBe(1);
    expect(times("used > 0")).toBe(1);
    expect(body).toContain("el.animate");
  });
});

describe("用后高正数", () => {
  it("正数长度优先，否则用另一个数", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "grow-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("tripTo > 0 ? tripTo : " + "prev")).toBe(0);
    expect(times("to > 0 ? to : " + "from")).toBe(0);
    expect(body).toContain("growKept(tripTo, prev)");
    expect(body).toContain("growKept(to, from)");
    expect(times("function growKept")).toBe(1);
    expect(times("return primary > 0 ? primary : fallback")).toBe(1);
    expect(times("used > 0")).toBe(1);
    expect(body).toContain("function growCssPx");
    expect(body).toContain("growCssPx(px)");
  });
});

describe("用后高节点", () => {
  it("HTMLElement 读高，否则没有高度", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "grow-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("marked instanceof " + "HTMLElement")).toBe(0);
    expect(times("child instanceof " + "HTMLElement")).toBe(0);
    expect(times("marked.offsetHeight")).toBe(0);
    expect(times("child.offsetHeight")).toBe(0);
    expect(times("growNodeHeight(")).toBe(3);
    expect(times("function growNodeHeight")).toBe(1);
    expect(times("return node instanceof HTMLElement ? node.offsetHeight : undefined")).toBe(1);
    expect(times("slot instanceof HTMLElement")).toBe(1);
    expect(body).toContain("function growKept");
    expect(body).toContain("return el.offsetHeight");
  });
});

describe("用后高世代", () => {
  it("用后把行程世代加一", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "grow-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("tripId += " + "1")).toBe(0);
    expect(times("growNextId(tripId)")).toBe(2);
    expect(times("function growNextId")).toBe(1);
    expect(times("return current + 1")).toBe(1);
    expect(body).toContain("function growNodeHeight");
    expect(body).toContain("slot instanceof HTMLElement");
    expect(times("motionSpecMs(spec)")).toBe(2);
  });
});

describe("用后高清终点", () => {
  it("锁盒之前把终点清成零", () => {
    const body = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "grow-bind.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("tripTo = " + "0")).toBe(2);
    expect(times("let tripTo = (" + "0)")).toBe(0);
    expect(times("function growSettle")).toBe(1);
    expect(times("growSettle(growKept(tripTo, prev))")).toBe(1);
    expect(times("growSettle(measureGrowUsed(el))")).toBe(1);
    expect(times("growSettle(growKept(to, from))")).toBe(1);
    expect(times("lock(used)")).toBe(1);
    expect(times("growNextId(tripId)")).toBe(2);
    expect(body).toContain("function growNodeHeight");
    expect(times("used > 0")).toBe(1);
  });
});

describe("用后高缺省行程", () => {
  it("缺省行程只留在函数体", () => {
    const body = load("src/motion/engines/grow/grow.tsx");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("props.spec ?? " + "GROW_SPEC")).toBe(0);
    expect(times("spec ?? " + "GROW_SPEC")).toBe(1);
    expect(times("function growSpec")).toBe(1);
    expect(times("export function growSpec")).toBe(0);
    expect(times("growSpec(props.spec)")).toBe(2);
    expect(times("props.enabled !== false")).toBe(1);
  });
});

describe("用后高卸掉绑定", () => {
  it("卸掉只留在函数体", () => {
    const body = load("src/motion/engines/grow/grow.tsx");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("ctl?." + "dispose()")).toBe(1);
    expect(times("function growDispose")).toBe(1);
    expect(times("export function growDispose")).toBe(0);
    expect(times("growDispose()")).toBe(3);
    expect(times("ctl = undefined")).toBe(1);
    expect(times("function growSpec")).toBe(1);
    expect(times("growSpec(props.spec)")).toBe(2);
    expect(times("props.enabled !== false")).toBe(1);
  });
});
