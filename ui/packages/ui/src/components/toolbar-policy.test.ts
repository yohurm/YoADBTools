import { describe, expect, it } from "vitest";

import { toolbarHostAttrs } from "./toolbar-policy";

describe("toolbar-policy", () => {
  it("宿主是 toolbar 角色并带命令带铬", () => {
    expect(toolbarHostAttrs()).toEqual({
      role: "toolbar",
      "data-chrome": "band",
      "data-overflow": "scroll",
      "data-pad": "band",
    });
  });

  it("pad=xs 写成 data-pad", () => {
    expect(toolbarHostAttrs({ pad: "xs" })).toEqual({
      role: "toolbar",
      "data-chrome": "band",
      "data-overflow": "scroll",
      "data-pad": "xs",
    });
  });
});
