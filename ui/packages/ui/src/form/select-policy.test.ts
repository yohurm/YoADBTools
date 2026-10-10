import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applySelectEscape,
  applySelectKey,
  closeSelect,
  idleSelectSession,
  openSelect,
  optionIsHot,
  pointSelect,
  selectEffectIsCommit,
  selectEffectIsNone,
  selectHostAttrs,
  toggleSelect,
} from "./select-policy";

const OPTIONS = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
  { value: "c", label: "C" },
];

describe("select-policy", () => {
  it("禁用同时关掉开合", () => {
    expect(toggleSelect(false, OPTIONS, "a", true)).toEqual(idleSelectSession());
    expect(applySelectKey("ArrowDown", idleSelectSession(), OPTIONS, "a", true)).toEqual({
      type: "none",
    });
    expect(applySelectEscape(true, true)).toBeNull();
  });

  it("点击开合：打开时活动项落到选中且不画悬停洗；再点关闭", () => {
    expect(openSelect(OPTIONS, "b")).toEqual({ open: true, activeIndex: 1, highlight: false });
    expect(toggleSelect(false, OPTIONS, "c")).toEqual({ open: true, activeIndex: 2, highlight: false });
    expect(toggleSelect(true, OPTIONS, "c")).toEqual(closeSelect());
  });

  it("闭合态方向键只展开，不步进、不画悬停洗", () => {
    expect(applySelectKey("ArrowDown", idleSelectSession(), OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0, highlight: false },
    });
  });

  it("展开态方向键步进；Home/End 到首尾，并打开悬停洗", () => {
    const open = { open: true, activeIndex: 0, highlight: false };
    expect(applySelectKey("ArrowDown", open, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 1, highlight: true },
    });
    expect(applySelectKey("End", open, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 2, highlight: true },
    });
    expect(applySelectKey("Home", { open: true, activeIndex: 2, highlight: false }, OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0, highlight: true },
    });
  });

  it("Enter/Space 闭合态开合，展开态提交活动项", () => {
    expect(applySelectKey("Enter", idleSelectSession(), OPTIONS, "a")).toEqual({
      type: "session",
      session: { open: true, activeIndex: 0, highlight: false },
    });
    expect(applySelectKey(" ", { open: true, activeIndex: 1, highlight: true }, OPTIONS, "a")).toEqual({
      type: "commit",
      value: "b",
      session: closeSelect(),
    });
  });

  it("Tab 提交活动项并关闭", () => {
    expect(applySelectKey("Tab", { open: true, activeIndex: 2, highlight: true }, OPTIONS, "a")).toEqual({
      type: "commit",
      value: "c",
      session: closeSelect(),
    });
    expect(applySelectKey("Tab", idleSelectSession(), OPTIONS, "a")).toEqual({ type: "none" });
  });

  it("Esc 只在展开且未禁用时关闭", () => {
    expect(applySelectEscape(true)).toEqual(closeSelect());
    expect(applySelectEscape(false)).toBeNull();
  });

  it("宿主只写 data-disabled / data-block", () => {
    expect(selectHostAttrs({})).toEqual({
      "data-disabled": undefined,
      "data-block": undefined,
    });
    expect(selectHostAttrs({ disabled: true, block: true })).toEqual({
      "data-disabled": "",
      "data-block": "",
    });
  });

  it("打开时不画悬停洗；指针移入后才画在活动项上", () => {
    const opened = openSelect(OPTIONS, "a");
    expect(optionIsHot(opened, 0)).toBe(false);
    const pointed = pointSelect(opened, 1);
    expect(pointed).toEqual({ open: true, activeIndex: 1, highlight: true });
    expect(optionIsHot(pointed, 1)).toBe(true);
    expect(optionIsHot(pointed, 0)).toBe(false);
    expect(pointSelect(idleSelectSession(), 0)).toEqual(idleSelectSession());
  });

  it("没有 applySelectHover 空政策", () => {
    const candidates = [
      resolve(process.cwd(), "src/form/select-policy.ts"),
      resolve(process.cwd(), "packages/ui/src/form/select-policy.ts"),
    ];
    const src = candidates.map((p) => (existsSync(p) ? readFileSync(p, "utf-8") : "")).find(Boolean) ?? "";
    expect(src.length).toBeGreaterThan(0);
    expect(src).not.toMatch(/\bapplySelectHover\b/);
  });

  it("空效果与提交各判一次", () => {
    expect(selectEffectIsNone({ type: "none" })).toBe(true);
    expect(selectEffectIsCommit({ type: "commit", value: "a", session: closeSelect() })).toBe(true);
    expect(selectEffectIsNone({ type: "session", session: idleSelectSession() })).toBe(false);
    expect(selectEffectIsCommit({ type: "none" })).toBe(false);
  });
});

describe("下拉键盘效果只在策略判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("视图不再比较 effect.type", () => {
    for (const name of ["select-policy.ts", "Select.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return effect.type === "none"', "");
      body = body.replaceAll('return effect.type === "commit"', "");
      expect(body, name).not.toContain('effect.type === "none"');
      expect(body, name).not.toContain('effect.type === "commit"');
      expect(body, name).not.toContain('effect.type === "session"');
    }
  });
});
