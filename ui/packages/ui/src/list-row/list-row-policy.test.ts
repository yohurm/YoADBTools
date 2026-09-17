import { describe, expect, it } from "vitest";

import { listRowHostAttrs } from "./list-row-policy";

describe("list-row-policy", () => {
  it("缺省 document，无填，无 chip", () => {
    expect(listRowHostAttrs({})).toEqual({
      "data-tone": "document",
      "data-fill": undefined,
      "data-selectable": undefined,
      "data-radius": undefined,
    });
  });

  it("document 可选单选写 data-radius=chip", () => {
    expect(listRowHostAttrs({ selectable: true })).toEqual({
      "data-tone": "document",
      "data-fill": undefined,
      "data-selectable": "",
      "data-radius": "chip",
    });
  });

  it("选中 / 热态只写 fill，不写 ring；list 不写 chip", () => {
    expect(
      listRowHostAttrs({ tone: "list", selected: true, selectable: true }),
    ).toEqual({
      "data-tone": "list",
      "data-fill": "selected",
      "data-selectable": "",
      "data-radius": undefined,
    });
    expect(listRowHostAttrs({ tone: "list", selected: true, hot: true, selectable: true })).toEqual({
      "data-tone": "list",
      "data-fill": "hot",
      "data-selectable": "",
      "data-radius": undefined,
    });
    expect(JSON.stringify(listRowHostAttrs({ hot: true }))).not.toContain("ring");
  });
});
