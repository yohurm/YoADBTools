import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  SUBHEADER_CONTENT_INK,
  SUBHEADER_LIST_INK,
  resolveSubheaderInk,
  resolveSubheaderSpec,
  subheaderPadIsFlush,
  subheaderToneIsContent,
} from "./subheader-model";

describe("subheader-model", () => {
  it("列表型走二级字，内容型走一级字，禁止三级当标题", () => {
    expect(resolveSubheaderInk("list")).toBe(SUBHEADER_LIST_INK);
    expect(resolveSubheaderInk("content")).toBe(SUBHEADER_CONTENT_INK);
    expect(SUBHEADER_LIST_INK).toBe("--yohu-fg-2");
    expect(SUBHEADER_CONTENT_INK).toBe("--yohu-fg");
    expect(resolveSubheaderSpec({ title: "命令组" }).ink).toBe("--yohu-fg-2");
    expect(resolveSubheaderSpec({ title: "组名称", tone: "content" }).ink).toBe("--yohu-fg");
    expect(subheaderToneIsContent("content")).toBe(true);
    expect(subheaderToneIsContent("list")).toBe(false);
    expect(subheaderPadIsFlush("flush")).toBe(true);
    expect(subheaderPadIsFlush()).toBe(false);
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "subheader-model.ts"), "utf8");
    const body = src.replace('return tone === "content"', "").replace('return pad === "flush"', "");
    expect(body).not.toContain('tone === "content"');
    expect(body).not.toContain('pad === "flush"');
  });
});
