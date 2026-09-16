import { describe, expect, it } from "vitest";

import { listRowHostAttrs } from "./list-row-policy";

describe("list-row-policy", () => {
  it("缺省 document，无填", () => {
    expect(listRowHostAttrs({})).toEqual({
      "data-tone": "document",
      "data-fill": undefined,
      "data-selectable": undefined,
    });
  });

  it("选中 / 热态只写 fill，不写 ring", () => {
    expect(
      listRowHostAttrs({ tone: "list", selected: true, selectable: true }),
    ).toEqual({
      "data-tone": "list",
      "data-fill": "selected",
      "data-selectable": "",
    });
    expect(listRowHostAttrs({ tone: "list", selected: true, hot: true, selectable: true })).toEqual({
      "data-tone": "list",
      "data-fill": "hot",
      "data-selectable": "",
    });
    expect(JSON.stringify(listRowHostAttrs({ hot: true }))).not.toContain("ring");
  });
});
