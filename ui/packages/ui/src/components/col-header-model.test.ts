import { describe, expect, it } from "vitest";
import {
  DEFAULT_COL_HEADER_ALIGN,
  DEFAULT_COL_HEADER_SORT,
  resolveColHeaderAlign,
  resolveColHeaderSort,
  resolveColHeaderSpec,
} from "./col-header-model";
import { colHeaderHostAttrs } from "./col-header-policy";

describe("col-header-model / policy", () => {
  it("缺省靠左、未排序", () => {
    expect(resolveColHeaderSpec({})).toEqual({
      align: DEFAULT_COL_HEADER_ALIGN,
      sort: DEFAULT_COL_HEADER_SORT,
      resizable: false,
    });
    expect(DEFAULT_COL_HEADER_ALIGN).toBe("start");
    expect(DEFAULT_COL_HEADER_SORT).toBe("none");
  });

  it("未知 align / ariaSort 归一成缺省，不留别名", () => {
    expect(resolveColHeaderAlign("left")).toBe("start");
    expect(resolveColHeaderAlign("end")).toBe("end");
    expect(resolveColHeaderSort("asc")).toBe("none");
    expect(resolveColHeaderSort("descending")).toBe("descending");
  });

  it("拖条要同时有 resizable、宽和回调", () => {
    expect(resolveColHeaderSpec({ resizable: true, width: 120 }).resizable).toBe(false);
    expect(
      resolveColHeaderSpec({ resizable: true, width: 120, onWidthChange: () => undefined }).resizable,
    ).toBe(true);
  });

  it("宿主只写 data-align / aria-sort；拖中才有 data-resizing", () => {
    const idle = colHeaderHostAttrs({ align: "end", ariaSort: "ascending" });
    expect(idle["data-align"]).toBe("end");
    expect(idle["aria-sort"]).toBe("ascending");
    expect(idle["data-resizing"]).toBeUndefined();
    expect(colHeaderHostAttrs({ resizing: true })["data-resizing"]).toBe("");
  });
});
