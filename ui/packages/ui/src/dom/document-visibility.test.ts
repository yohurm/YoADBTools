import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { closedAttr, flagAttr, trueAttr } from "../index";
import { documentIsHidden, documentIsVisible } from "./document-visibility";

describe("公开入口 closedAttr", () => {
  it("关掉写成 true，开着省略", () => {
    expect(closedAttr(false)).toBe(true);
    expect(closedAttr(true)).toBeUndefined();
    expect(trueAttr(true)).toBe(true);
    expect(trueAttr(false)).toBeUndefined();
    expect(flagAttr(true)).toBe("true");
    expect(flagAttr(false)).toBe("false");
  });
});

describe("页面可见性", () => {
  it("hidden 与 visible 各判一次", () => {
    expect(documentIsHidden({ visibilityState: "hidden" } as Document)).toBe(true);
    expect(documentIsVisible({ visibilityState: "visible" } as Document)).toBe(true);
    expect(documentIsHidden({ visibilityState: "visible" } as Document)).toBe(false);
    expect(documentIsVisible({ visibilityState: "hidden" } as Document)).toBe(false);
    expect(documentIsHidden({ visibilityState: "prerender" } as Document)).toBe(false);
    expect(documentIsVisible({ visibilityState: "prerender" } as Document)).toBe(false);
  });
});

describe("页面可见性只在 document-visibility 判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const files = [
    "document-visibility.ts",
    join("..", "..", "..", "workbench", "src", "boot.ts"),
    join("..", "..", "..", "modules", "logs", "src", "capture.ts"),
    join("..", "..", "..", "modules", "mirror", "src", "MirrorView.tsx"),
  ];

  it("启动、采集和投屏不再比较 visibilityState / document.hidden", () => {
    for (const name of files) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return doc?.visibilityState === "hidden"', "");
      body = body.replaceAll('return doc?.visibilityState === "visible"', "");
      expect(body, name).not.toContain('visibilityState === "hidden"');
      expect(body, name).not.toContain('visibilityState === "visible"');
      expect(body, name).not.toContain("document.hidden");
    }
  });
});
