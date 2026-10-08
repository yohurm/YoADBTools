import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MotionSpec } from "../../../tokens/motion";
import { TRAVEL_SPEC } from "../../spec/recipes";

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

describe("travel axes", () => {
  it("block 与 inline 共用 TRAVEL_SPEC", () => {
    expect(TRAVEL_SPEC).toBe("spatialPanel");
    expect(MotionSpec[TRAVEL_SPEC]).toEqual(MotionSpec.spatialPanel);

    const css = load("src/motion/engines/travel/travel.css");
    expect(css).toContain("height var(--yohu-motion-spatial-panel)");
    expect(css).toContain("width var(--yohu-motion-spatial-panel)");
    expect(css).toContain("width: var(--yohu-travel-inline, auto)");
    expect(css).toContain("height: var(--yohu-travel-block, auto)");
    expect(css).toContain("flex: var(--yohu-travel-flex, 0 1 auto)");
    expect(css).toContain(".yohu-travel__slot");
    const slot = css.match(/\.yohu-travel__slot\s*\{[^}]*\}/)?.[0] ?? "";
    expect(slot).toContain("flex: 1 1 auto");
    expect(slot).toContain("height: 100%");
    expect(css).toContain(".yohu-travel[data-ready] > .yohu-travel__slot");
    expect(css).not.toMatch(/\.yohu-travel\[data-ready\]\s*>\s*\.yohu-travel__slot\s*\{[^}]*height:/);
    expect(css).not.toMatch(/\.yohu-travel\[data-ready\]\s*>\s*\*/);
    expect(css).not.toContain("> *");
    expect(css).not.toContain("--yohu-motion-spatial-local");
    expect(css).not.toContain("animate(");
    expect(css).not.toContain("@keyframes");

    const ts = [
      load("src/motion/engines/travel/travel.tsx"),
      load("src/motion/engines/travel/travel-bind.ts"),
    ].join("\n");
    expect(ts).toContain("TRAVEL_SPEC");
    expect(ts).toContain("spec ?? TRAVEL_SPEC");
    expect(ts).toContain("host.spec?.() ?? TRAVEL_SPEC");
  });
});

describe("行程缺省行程", () => {
  it("缺省行程只留在函数体", () => {
    const body = load("src/motion/engines/travel/travel.tsx");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("props.spec ?? " + "TRAVEL_SPEC")).toBe(0);
    expect(times("spec ?? " + "TRAVEL_SPEC")).toBe(1);
    expect(times("function travelSpec")).toBe(1);
    expect(times("export function travelSpec")).toBe(0);
    expect(times("travelSpec(props.spec)")).toBe(2);
    expect(times("props.enabled !== false")).toBe(1);
  });
});

describe("行程卸掉绑定", () => {
  it("卸掉绑定只留在函数体", () => {
    const body = load("src/motion/engines/travel/travel.tsx");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("ctl?." + "dispose()")).toBe(1);
    expect(times("function travelDispose")).toBe(1);
    expect(times("export function travelDispose")).toBe(0);
    expect(times("travelDispose()")).toBe(3);
    expect(times("ctl = undefined")).toBe(1);
    expect(times("function travelSpec")).toBe(1);
    expect(times("travelSpec(props.spec)")).toBe(2);
    expect(times("props.enabled !== false")).toBe(1);
  });
});
