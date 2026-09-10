import { describe, expect, it } from "vitest";
import {
  resolveSegmentedCommit,
  resolveSegmentedInteractive,
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
      "data-hybrid": undefined,
      "data-icon-size": "md",
      "aria-disabled": undefined,
    });
  });

  it("capsule 写入强调涂装，不是 tab 别名", () => {
    const attrs = segmentedHostAttrs({ items: ITEMS, type: "capsule", disabled: true });
    expect(attrs["data-paint"]).toBe("capsule-accent");
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
    expect(segmentedItemAttrs(ITEMS[0], "package")).toEqual({
      selected: true,
      disabled: false,
      tabIndex: 0,
      "aria-checked": true,
    });
    expect(segmentedItemAttrs(ITEMS[2], "package").disabled).toBe(true);
    expect(segmentedItemAttrs(ITEMS[1], "package", true).disabled).toBe(true);
  });
});
