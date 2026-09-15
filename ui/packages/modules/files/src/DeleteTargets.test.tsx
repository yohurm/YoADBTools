import { fireEvent, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { DeleteTargets } from "./DeleteTargets";
import { DELETE_PREVIEW_LIMIT } from "./delete-targets";

function manyNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `file-${i}.png`);
}

function visibleChips(): Element[] {
  return [...document.querySelectorAll(".yohu-chip")].filter(
    (el) => el.closest("[aria-hidden='true']") == null,
  );
}

describe("DeleteTargets", () => {
  it("单文件不显示展开", () => {
    render(() => (
      <DeleteTargets names={["a.png"]} expanded={false} onExpandedChange={() => {}} onRemove={() => {}} />
    ));
    expect(visibleChips()).toHaveLength(1);
    expect(document.querySelector("[aria-expanded]")).toBeNull();
    expect(document.querySelector(".yohu-collapse")).toBeNull();
    expect(document.body.textContent).toContain("确定删除以下 1 项吗");
  });

  it("多文件默认只露前几项，其余走 YoCollapse", () => {
    const names = manyNames(DELETE_PREVIEW_LIMIT + 4);
    render(() => (
      <DeleteTargets names={names} expanded={false} onExpandedChange={() => {}} onRemove={() => {}} />
    ));
    expect(visibleChips()).toHaveLength(DELETE_PREVIEW_LIMIT);
    expect(document.querySelector(".yohu-collapse")?.getAttribute("data-open")).toBe("false");
    expect(document.body.textContent).toContain(`展开其余 4 项`);
    expect(visibleChips().some((el) => el.textContent?.includes("file-6.png"))).toBe(false);
  });

  it("展开后行列全量并显示收起", () => {
    const names = manyNames(DELETE_PREVIEW_LIMIT + 2);
    const [expanded, setExpanded] = createSignal(false);
    render(() => (
      <DeleteTargets
        names={names}
        expanded={expanded()}
        onExpandedChange={setExpanded}
        onRemove={() => {}}
      />
    ));
    fireEvent.click(document.querySelector("[aria-expanded]")!);
    expect(expanded()).toBe(true);
    expect(document.querySelector(".yohu-collapse")?.getAttribute("data-open")).toBe("true");
    expect(visibleChips()).toHaveLength(names.length);
    expect(document.body.textContent).toContain("收起");
    expect(document.querySelector(".yohu-files__delete-more")).toBeTruthy();
    expect(
      document.querySelector(".yohu-files__delete-more .yohu-files__delete-grid"),
    ).toBeTruthy();
  });

  it("YoChip dismiss 按名移除", () => {
    const removed: string[] = [];
    render(() => (
      <DeleteTargets
        names={["keep.png", "drop.png"]}
        expanded={false}
        onExpandedChange={() => {}}
        onRemove={(name) => removed.push(name)}
      />
    ));
    const close = document.querySelector('[aria-label="移除 drop.png"]');
    expect(close).toBeTruthy();
    fireEvent.click(close!);
    expect(removed).toEqual(["drop.png"]);
  });
});
