import { describe, expect, it } from "vitest";

import { parseRemotePath } from "@yohu/api";
import { parseRemotePath as moduleParse } from "./path-parse";

describe("path-parse", () => {
  it("模块转发 @yohu/api", () => {
    expect(moduleParse).toBe(parseRemotePath);
  });
});
