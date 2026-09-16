import { describe, expect, it } from "vitest";
import {
  resolveSegmentedCommit,
  resolveSegmentedInteractive,
  resolveSegmentedKeyAction,
  resolveSegmentedMultiCommit,
  resolveSegmentedPointerAction,
  resolveSegmentedRoving,
  resolveSegmentedSelection,
  segmentedHostAttrs,
  segmentedItemAttrs,
} from "./segmented-policy";

const ITEMS = [
  { value: "package", label: "包名" },
  { value: "pid", label: "PID" },
  { value: "all", label: "全部", disabled: true },
];

describe("segmented-policy", () => {
  it("默认可点", () => {
    expect(resolveSegmentedInteractive({})).toEqual({ disabled: false });
  });

  it("整组禁用关掉输入", () => {
    expect(resolveSegmentedInteractive({ disabled: true })).toEqual({ disabled: true });
  });

  it("缺省宿主是 tab 白选择块 + md", () => {
    expect(segmentedHostAttrs({ items: ITEMS })).toEqual({
      "data-type": "tab",
      "data-size": "md",
      "data-paint": "tab-surface",
      "data-fill-owner": "thumb",
      "data-hybrid": undefined,
      "data-multiple": undefined,
      "data-block": undefined,
      "data-icon-size": "md",
      "aria-disabled": undefined,
      "aria-multiselectable": undefined,
    });
  });

  it("capsule 写入强调涂装，不是 tab 别名", () => {
    const attrs = segmentedHostAttrs({ items: ITEMS, type: "capsule", disabled: true });
    expect(attrs["data-paint"]).toBe("capsule-accent");
    expect(attrs["data-fill-owner"]).toBe("thumb");
    expect(attrs["data-type"]).toBe("capsule");
    expect(attrs["aria-disabled"]).toBe(true);
  });

  it("图文混合挂 hybrid 与中图标", () => {
    const attrs = segmentedHostAttrs({
      items: [
        { value: "package", label: "包名", icon: "search" },
        { value: "pid", label: "PID", icon: "log" },
      ],
      size: "sm",
    });
    expect(attrs["data-hybrid"]).toBe("");
    expect(attrs["data-icon-size"]).toBe("md");
  });

  it("sm 非 hybrid 走小图标", () => {
    expect(segmentedHostAttrs({ items: ITEMS, size: "sm" })["data-icon-size"]).toBe("sm");
  });

  it("提交未选项会改值；再点当前项不改值", () => {
    expect(resolveSegmentedCommit(ITEMS, "package", 1)).toEqual({
      index: 1,
      value: "pid",
      changed: true,
    });
    expect(resolveSegmentedCommit(ITEMS, "package", 0)).toEqual({
      index: 0,
      value: "package",
      changed: false,
    });
  });

  it("整组或单项禁用拒绝提交", () => {
    expect(resolveSegmentedCommit(ITEMS, "package", 1, true)).toBeUndefined();
    expect(resolveSegmentedCommit(ITEMS, "package", 2)).toBeUndefined();
    expect(resolveSegmentedCommit(ITEMS, "package", 9)).toBeUndefined();
  });

  it("选中项 tabindex=0，禁用项关掉输入", () => {
    expect(segmentedItemAttrs(ITEMS[0], ["package"])).toEqual({
      selected: true,
      disabled: false,
      tabIndex: 0,
      content: "text",
      graphic: undefined,
      join: "only",
      ink: undefined,
      name: "包名",
      description: undefined,
      "aria-checked": true,
      "aria-pressed": undefined,
    });
    expect(segmentedItemAttrs(ITEMS[2], ["package"]).disabled).toBe(true);
    expect(segmentedItemAttrs(ITEMS[1], ["package"], { groupDisabled: true }).disabled).toBe(true);
  });

  it("capsule multiple 挂多选涂装；tab 上的 multiple 不生效", () => {
    const multi = segmentedHostAttrs({ items: ITEMS, type: "capsule", multiple: true });
    expect(multi["data-paint"]).toBe("capsule-multi");
    expect(multi["data-fill-owner"]).toBe("item");
    expect(multi["data-multiple"]).toBe("");
    expect(multi["aria-multiselectable"]).toBe(true);
    expect(segmentedHostAttrs({ items: ITEMS, type: "tab", multiple: true })["data-multiple"]).toBeUndefined();
  });

  it("多选提交切换集合，再点取消", () => {
    expect(resolveSegmentedMultiCommit(ITEMS, ["package"], 1)).toEqual({
      index: 1,
      values: ["package", "pid"],
      changed: true,
    });
    expect(resolveSegmentedMultiCommit(ITEMS, ["package", "pid"], 0)).toEqual({
      index: 0,
      values: ["pid"],
      changed: true,
    });
    expect(resolveSegmentedMultiCommit(ITEMS, ["package"], 2)).toBeUndefined();
  });

  it("多选项走 aria-pressed，不是 radio", () => {
    const attrs = segmentedItemAttrs(ITEMS[0], ["package"], { multiple: true, roving: "package" });
    expect(attrs["aria-pressed"]).toBe(true);
    expect(attrs["aria-checked"]).toBeUndefined();
  });

  it("block 挂 data-block；相邻选中写 join", () => {
    expect(segmentedHostAttrs({ items: ITEMS, block: true })["data-block"]).toBe("");
    const start = segmentedItemAttrs(ITEMS[0], ["package", "pid"], {
      items: ITEMS,
      index: 0,
    });
    const end = segmentedItemAttrs(ITEMS[1], ["package", "pid"], {
      items: ITEMS,
      index: 1,
    });
    expect(start.join).toBe("start");
    expect(end.join).toBe("end");
  });

  it("选中项切换 selectedIcon，并带无障碍说明", () => {
    const item = {
      value: "search",
      icon: "search",
      selectedIcon: "log",
      ariaLabel: "检索",
      ariaDescription: "按包名检索",
    };
    expect(segmentedItemAttrs(item, ["search"]).graphic).toEqual({ kind: "icon", name: "log" });
    expect(segmentedItemAttrs(item, []).graphic).toEqual({ kind: "icon", name: "search" });
    expect(segmentedItemAttrs(item, ["search"]).description).toBe("按包名检索");
  });

  it("项 ink / fill 进 attrs，不在宿主上改写", () => {
    const item = {
      value: "v",
      label: "V",
      ink: "var(--yohu-level-v)",
      fill: "var(--yohu-level-v)",
    };
    expect(segmentedItemAttrs(item, []).ink).toBe("var(--yohu-level-v)");
    expect(segmentedItemAttrs(item, ["v"]).ink).toBe("var(--yohu-level-v)");
    expect(segmentedItemAttrs(item, []).fill).toBe("var(--yohu-level-v)");
    expect(segmentedItemAttrs(item, ["v"]).fill).toBe("var(--yohu-level-v)");
  });

  it("选择与 roving 走 L3，不让视图直调 L2", () => {
    expect(resolveSegmentedSelection(ITEMS, false, "pid")).toEqual(["pid"]);
    expect(resolveSegmentedSelection(ITEMS, true, undefined, ["pid", "missing"])).toEqual(["pid"]);
    expect(resolveSegmentedRoving(ITEMS, ["pid"], { multiple: false, value: "package" })).toBe("package");
    expect(resolveSegmentedRoving(ITEMS, ["pid"], { multiple: true, focus: "package" })).toBe("package");
  });

  it("指针提交单选改值，多选切换集合", () => {
    expect(
      resolveSegmentedPointerAction({ items: ITEMS, multiple: false, value: "package" }, 1),
    ).toEqual({
      kind: "commit-single",
      index: 1,
      value: "pid",
      changed: true,
      focus: false,
      focusValue: "pid",
    });
    expect(
      resolveSegmentedPointerAction({ items: ITEMS, multiple: true, values: ["package"] }, 1),
    ).toEqual({
      kind: "commit-multi",
      index: 1,
      values: ["package", "pid"],
      changed: true,
      focus: false,
      focusValue: "pid",
    });
    expect(
      resolveSegmentedPointerAction({ items: ITEMS, multiple: false, value: "package", disabled: true }, 1),
    ).toBeUndefined();
  });

  it("键盘单选提交并移焦，多选只 roving", () => {
    expect(
      resolveSegmentedKeyAction({ items: ITEMS, multiple: false, value: "package", roving: "package" }, "ArrowRight"),
    ).toEqual({
      kind: "commit-single",
      index: 1,
      value: "pid",
      changed: true,
      focus: true,
      focusValue: "pid",
    });
    expect(
      resolveSegmentedKeyAction({ items: ITEMS, multiple: true, values: ["package"], roving: "package" }, "ArrowRight"),
    ).toEqual({
      kind: "roving",
      index: 1,
      focusValue: "pid",
    });
    expect(
      resolveSegmentedKeyAction({ items: ITEMS, multiple: false, value: "package", roving: "package" }, "Enter"),
    ).toBeUndefined();
  });
});
