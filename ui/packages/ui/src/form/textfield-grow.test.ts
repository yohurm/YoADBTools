import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { bindTextFieldGrow } from "./textfield-grow";

const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "textfield-grow.ts"), "utf8");

describe("textfield-grow", () => {
  it("只订意图，不读 scrollHeight、不写 height", () => {
    expect(src).toContain("field-sizing");
    expect(src).toContain("clientWidth");
    expect(src).not.toContain(".scrollHeight");
    expect(src).not.toContain("style.height");
    expect(src).not.toContain("countTextFieldLines");
  });

  it("input / change 当拍通知，块轴 Resize 不通知", () => {
    const field = document.createElement("textarea");
    Object.defineProperty(field, "clientWidth", { configurable: true, value: 200 });
    const onIntent = vi.fn();
    const dispose = bindTextFieldGrow(field, { onIntent });
    field.dispatchEvent(new Event("input"));
    field.dispatchEvent(new Event("change"));
    field.dispatchEvent(new Event("paste"));
    expect(onIntent).toHaveBeenCalledTimes(3);
    dispose();
  });
});
