import { describe, expect, it } from "vitest";

import { toolbarHostAttrs } from "./toolbar-policy";

describe("toolbar-policy", () => {
  it("宿主是 toolbar 角色并带命令带铬", () => {
    expect(toolbarHostAttrs()).toEqual({
      role: "toolbar",
      "data-chrome": "band",
      "data-overflow": "scroll",
    });
  });
});
