import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEGMENTED_SIZE,
  DEFAULT_SEGMENTED_TYPE,
  YO_SEGMENTED_MAX_ITEMS,
  edgeEnabledIndex,
  enabledItemIndexes,
  isHybridItems,
  itemAccessibleName,
  resolveKeyIndex,
  resolveRovingValue,
  resolveSegmentedJoin,
  resolveSegmentedSpec,
  resolveSelectedIndex,
  resolveSegmentedGraphic,
  resolveSelectedValues,
  segmentKeyIntent,
  segmentedFillCell,
  segmentedFillOwner,
  segmentedIconSize,
  segmentedItemContent,
  segmentedPaintKind,
  stepEnabledIndex,
  toggleSelectedValues,
  type SegmentedInteract,
  type SegmentedPaintKind,
} from "./segmented-model";

const ITEMS = [
  { value: "package" },
  { value: "pid" },
  { value: "all", disabled: true },
  { value: "tag" },
];

describe("segmented-model", () => {
  it("大屏上限是 7（鸿蒙更大屏幕）", () => {
    expect(YO_SEGMENTED_MAX_ITEMS).toBe(7);
  });

  it("仅有图标或仅有文本不是 hybrid", () => {
    expect(isHybridItems([{ value: "a", label: "包名" }])).toBe(false);
    expect(isHybridItems([{ value: "a", icon: "search" }])).toBe(false);
    expect(isHybridItems([{ value: "a", label: "包名", icon: "search" }])).toBe(true);
  });

  it("未知 value 回退到 0，不抛", () => {
    expect(resolveSelectedIndex(ITEMS, "missing")).toBe(0);
    expect(resolveSelectedIndex(ITEMS, "pid")).toBe(1);
  });

  it("enabled 跳过 disabled", () => {
    expect(enabledItemIndexes(ITEMS)).toEqual([0, 1, 3]);
  });

  it("步进循环且跳过禁用项", () => {
    const enabled = enabledItemIndexes(ITEMS);
    expect(stepEnabledIndex(enabled, 1, 1)).toBe(3);
    expect(stepEnabledIndex(enabled, 3, 1)).toBe(0);
    expect(stepEnabledIndex(enabled, 0, -1)).toBe(3);
  });

  it("Home/End 落在可用首尾", () => {
    const enabled = enabledItemIndexes(ITEMS);
    expect(edgeEnabledIndex(enabled, "start")).toBe(0);
    expect(edgeEnabledIndex(enabled, "end")).toBe(3);
  });

  it("方向键映射鸿蒙/ARIA 双向", () => {
    expect(segmentKeyIntent("ArrowRight")).toBe("next");
    expect(segmentKeyIntent("ArrowDown")).toBe("next");
    expect(segmentKeyIntent("ArrowLeft")).toBe("prev");
    expect(segmentKeyIntent("Home")).toBe("start");
    expect(segmentKeyIntent("a")).toBeNull();
  });

  it("resolveKeyIndex 组合选中与按键", () => {
    expect(resolveKeyIndex(ITEMS, "package", "ArrowRight")).toBe(1);
    expect(resolveKeyIndex(ITEMS, "pid", "ArrowRight")).toBe(3);
    expect(resolveKeyIndex(ITEMS, "tag", "Home")).toBe(0);
    expect(resolveKeyIndex(ITEMS, "package", "Enter")).toBeUndefined();
  });

  it("缺省是 tab + md 单选，capsule 才是强调涂装", () => {
    expect(resolveSegmentedSpec({})).toEqual({
      type: DEFAULT_SEGMENTED_TYPE,
      size: DEFAULT_SEGMENTED_SIZE,
      multiple: false,
      block: false,
    });
    expect(segmentedPaintKind("tab")).toBe("tab-surface");
    expect(segmentedPaintKind("capsule")).toBe("capsule-accent");
    expect(segmentedPaintKind("capsule", true)).toBe("capsule-multi");
    expect(segmentedFillOwner("tab-surface")).toBe("thumb");
    expect(segmentedFillOwner("capsule-accent")).toBe("thumb");
    expect(segmentedFillOwner("capsule-multi")).toBe("item");
  });

  it("paint × selected × 交互态给出 fill 归属与色名", () => {
    const paints: SegmentedPaintKind[] = ["tab-surface", "capsule-accent", "capsule-multi"];
    const interacts: SegmentedInteract[] = ["default", "hover", "pressed", "disabled"];
    for (const paint of paints) {
      for (const selected of [false, true]) {
        for (const interact of interacts) {
          const cell = segmentedFillCell(paint, selected, interact);
          if (!selected) {
            expect(cell.owner).toBe("item");
            expect(cell.overlay).toBe("none");
            expect(cell.color).toBe(interact === "disabled" ? "--yohu-disabled" : "ink");
          } else {
            expect(cell.owner).toBe(segmentedFillOwner(paint));
            expect(cell.fill).not.toBe("none");
            expect(cell.color).toBe(interact === "disabled" ? "--yohu-disabled" : paint === "tab-surface" ? "--yohu-fg" : "--yohu-fg-on");
          }
        }
      }
    }
    expect(segmentedFillCell("tab-surface", true, "default")).toEqual({
      owner: "thumb",
      fill: "--yohu-surface",
      overlay: "none",
      color: "--yohu-fg",
    });
    expect(segmentedFillCell("tab-surface", true, "hover")).toEqual({
      owner: "thumb",
      fill: "--yohu-surface",
      overlay: "--yohu-state-hover",
      color: "--yohu-fg",
    });
    expect(segmentedFillCell("capsule-accent", true, "pressed")).toEqual({
      owner: "thumb",
      fill: "--yohu-accent",
      overlay: "--yohu-state-pressed",
      color: "--yohu-fg-on",
    });
    expect(segmentedFillCell("capsule-multi", true, "hover")).toEqual({
      owner: "item",
      fill: "--yohu-accent",
      overlay: "--yohu-state-hover",
      color: "--yohu-fg-on",
    });
    expect(segmentedFillCell("tab-surface", false, "hover")).toEqual({
      owner: "item",
      fill: "--yohu-state-hover",
      overlay: "none",
      color: "ink",
    });
  });

  it("tab 强制单选，只有 capsule 才认 multiple", () => {
    expect(resolveSegmentedSpec({ type: "tab", multiple: true }).multiple).toBe(false);
    expect(resolveSegmentedSpec({ type: "capsule", multiple: true })).toEqual({
      type: "capsule",
      size: "md",
      multiple: true,
      block: false,
    });
    expect(resolveSegmentedSpec({ block: true }).block).toBe(true);
  });

  it("选项内容是文本 / 图标 / 图片 / 图文", () => {
    expect(segmentedItemContent({ value: "a", label: "粗体" })).toBe("text");
    expect(segmentedItemContent({ value: "a", icon: "search" })).toBe("icon");
    expect(segmentedItemContent({ value: "a", image: "face.png" })).toBe("image");
    expect(segmentedItemContent({ value: "a", label: "检索", icon: "search" })).toBe("hybrid");
    expect(segmentedItemContent({ value: "a", label: "头像", image: "face.png" })).toBe("hybrid");
    expect(itemAccessibleName({ value: "a", icon: "search", ariaLabel: "检索" })).toBe("检索");
  });

  it("选中图标 / 选中图片成对才切换", () => {
    expect(resolveSegmentedGraphic({ value: "a", icon: "search", selectedIcon: "log" }, false)).toEqual({
      kind: "icon",
      name: "search",
    });
    expect(resolveSegmentedGraphic({ value: "a", icon: "search", selectedIcon: "log" }, true)).toEqual({
      kind: "icon",
      name: "log",
    });
    expect(resolveSegmentedGraphic({ value: "a", icon: "search" }, true)).toEqual({
      kind: "icon",
      name: "search",
    });
    expect(resolveSegmentedGraphic({ value: "a", image: "off.png", selectedImage: "on.png" }, true)).toEqual({
      kind: "image",
      src: "on.png",
    });
  });

  it("多选值跟选项表去重保序，再点取消", () => {
    const items = [{ value: "b" }, { value: "i" }, { value: "u" }];
    expect(resolveSelectedValues(items, ["u", "missing", "b"])).toEqual(["b", "u"]);
    expect(toggleSelectedValues(items, ["b"], "i")).toEqual(["b", "i"]);
    expect(toggleSelectedValues(items, ["b", "i"], "b")).toEqual(["i"]);
  });

  it("多选 roving 落在焦点或首个已选", () => {
    const items = [{ value: "b" }, { value: "i", disabled: true }, { value: "u" }];
    expect(resolveRovingValue(items, ["u"], "b")).toBe("b");
    expect(resolveRovingValue(items, ["u"])).toBe("u");
    expect(resolveRovingValue(items, [])).toBe("b");
  });

  it("图标档：md 或 hybrid 走 md，仅 sm 非混合走 sm", () => {
    expect(segmentedIconSize({ type: "tab", size: "md", multiple: false, block: false }, false)).toBe("md");
    expect(segmentedIconSize({ type: "tab", size: "sm", multiple: false, block: false }, true)).toBe("md");
    expect(segmentedIconSize({ type: "tab", size: "sm", multiple: false, block: false }, false)).toBe("sm");
  });

  it("相邻选中并角，未选是 none", () => {
    const flags = [true, true, false, true, true, true];
    expect(resolveSegmentedJoin(flags, 0)).toBe("start");
    expect(resolveSegmentedJoin(flags, 1)).toBe("end");
    expect(resolveSegmentedJoin(flags, 2)).toBe("none");
    expect(resolveSegmentedJoin(flags, 3)).toBe("start");
    expect(resolveSegmentedJoin(flags, 4)).toBe("mid");
    expect(resolveSegmentedJoin(flags, 5)).toBe("end");
    expect(resolveSegmentedJoin([true], 0)).toBe("only");
  });
});
