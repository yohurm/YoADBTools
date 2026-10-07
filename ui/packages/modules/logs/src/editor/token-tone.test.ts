import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { tokenToneIsInk, tokenToneIsPlain, tokenToneIsWash } from "./token-tone";

describe("日志着色调", () => {
  it("plain / ink / wash 各判一次", () => {
    expect(tokenToneIsPlain("plain")).toBe(true);
    expect(tokenToneIsPlain("ink")).toBe(false);
    expect(tokenToneIsPlain(undefined)).toBe(false);
    expect(tokenToneIsInk("ink")).toBe(true);
    expect(tokenToneIsInk("wash")).toBe(false);
    expect(tokenToneIsWash("wash")).toBe(true);
    expect(tokenToneIsWash("plain")).toBe(false);
  });
});

describe("着色调只写一处", () => {
  it("格式器和着色模型不再自己比较 plain / ink / wash", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["token-tone.ts", "format.ts", "markup-model.ts"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return tone === "plain"', "");
      body = body.replaceAll('return tone === "ink"', "");
      body = body.replaceAll('return tone === "wash"', "");
      if (name === "token-tone.ts") body = body.replace('export type TokenTone = "plain" | "ink" | "wash";', "");
      expect(body, name).not.toContain('tone === "plain"');
      expect(body, name).not.toContain('tone === "ink"');
      expect(body, name).not.toContain('tone === "wash"');
      expect(body, name).not.toContain('tone !== "plain"');
      expect(body, name).not.toContain('"plain" | "ink" | "wash"');
    }
  });
});
