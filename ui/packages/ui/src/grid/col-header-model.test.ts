import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COL_HEADER_ALIGN,
  DEFAULT_COL_HEADER_SORT,
  colHeaderSortIsAscending,
  colHeaderSortIsDescending,
  colHeaderSortIsNone,
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
      tone: "list",
      resizable: false,
      edge: false,
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

  it("split 只出列缝，document tone 写 data-tone", () => {
    expect(resolveColHeaderSpec({ split: true })).toEqual({
      align: DEFAULT_COL_HEADER_ALIGN,
      sort: DEFAULT_COL_HEADER_SORT,
      tone: "list",
      resizable: false,
      edge: true,
    });
    expect(resolveColHeaderSpec({ tone: "document" }).tone).toBe("document");
    const host = colHeaderHostAttrs({ tone: "document", split: true });
    expect(host["data-tone"]).toBe("document");
    expect(host.edge).toBe(true);
    expect(host.resizable).toBe(false);
  });

  it("宿主只写 data-align / aria-sort；拖中才有 data-resizing", () => {
    const idle = colHeaderHostAttrs({ align: "end", ariaSort: "ascending" });
    expect(idle["data-align"]).toBe("end");
    expect(idle["aria-sort"]).toBe("ascending");
    expect(idle["data-resizing"]).toBeUndefined();
    expect(colHeaderHostAttrs({ resizing: true })["data-resizing"]).toBe("");
  });

  it("升序、降序、未排序各判一次", () => {
    expect(colHeaderSortIsAscending("ascending")).toBe(true);
    expect(colHeaderSortIsDescending("descending")).toBe(true);
    expect(colHeaderSortIsNone("none")).toBe(true);
    expect(colHeaderSortIsAscending("descending")).toBe(false);
  });
});

describe("表头排序方向只在模型判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("视图和策略不再比较 ascending / descending / none", () => {
    for (const name of ["col-header-model.ts", "col-header-policy.ts", "ColHeader.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return sort === "ascending"', "");
      body = body.replaceAll('return sort === "descending"', "");
      body = body.replaceAll('return sort === "none"', "");
      expect(body, name).not.toContain('=== "ascending"');
      expect(body, name).not.toContain('=== "descending"');
      expect(body, name).not.toContain('=== "none"');
      expect(body, name).not.toContain('!== "none"');
    }
  });
});

describe("列架 tone 缺省跟表头同一把", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("框不再自写 tone ?? list", () => {
    for (const name of ["col-header-model.ts", "col-header-policy.ts", "ColHeader.tsx", "ColFrame.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      if (name === "col-header-model.ts") {
        body = body.replace('export const DEFAULT_COL_HEADER_TONE: YoListRowTone = "list";', "");
      }
      expect(body, name).not.toContain('tone ?? "list"');
    }
  });
});
