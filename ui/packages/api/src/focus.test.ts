import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { boundSerial, reconcileFocus, resolveTargetSerials, selectionModeIsMulti, type SelectionMode } from "./focus";

const testdata = (name: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), `../../../../core/yohu-domain/testdata/${name}`);

describe("resolveTargetSerials（与 domain testdata/resolve_targets.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("resolve_targets.json"), "utf8")) as {
    mode: SelectionMode;
    focus: string | null;
    selected: string[];
    online: string[];
    expect: string[];
  }[];

  it.each(fixture)("$mode / focus=$focus", (c) => {
    expect(resolveTargetSerials(c.mode, c.focus, c.selected, c.online)).toEqual(c.expect);
  });
});

describe("reconcileFocus（与 domain testdata/reconcile_focus.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata("reconcile_focus.json"), "utf8")) as {
    focus: string | null;
    online: string[];
    expect: string | null;
  }[];

  it.each(fixture)("focus=$focus / online=$online", (c) => {
    expect(reconcileFocus(c.focus, c.online)).toEqual(c.expect);
  });
});

describe("选择作用域", () => {
  it("多选只判一次", () => {
    expect(selectionModeIsMulti("multiOptional")).toBe(true);
    expect(selectionModeIsMulti("singleRequired")).toBe(false);
    expect(selectionModeIsMulti("none")).toBe(false);
    expect(selectionModeIsMulti(undefined)).toBe(false);
  });

  it("轨和仓库不再自己比较 multiOptional", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "focus.ts"),
      resolve(here, "../../workbench/src/shell/DeviceRail.tsx"),
      resolve(here, "../../workbench/src/stores/device-store.ts"),
    ];
    for (const path of files) {
      let body = readFileSync(path, "utf8");
      if (path.endsWith("focus.ts")) body = body.replace('return mode === "multiOptional"', "");
      expect(body, path).not.toContain('=== "multiOptional"');
      expect(body, path).not.toContain('!== "multiOptional"');
    }
  });

  it("单选页面只认 boundSerial", () => {
    expect(boundSerial(["S1", "S2"])).toBe("S1");
    expect(boundSerial([])).toBeNull();
    const here = dirname(fileURLToPath(import.meta.url));
    const files = [
      resolve(here, "../../modules/files/src/FileView.tsx"),
      resolve(here, "../../modules/logs/src/LogAnalyzerView.tsx"),
      resolve(here, "../../modules/mirror/src/MirrorView.tsx"),
    ];
    for (const path of files) {
      expect(readFileSync(path, "utf8"), path).not.toContain("selectedSerials[0]");
    }
  });

  it("列表第一项没有时只判断一次", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(resolve(here, "focus.ts"), "utf8");
    const needle = "[0] " + "?? null";
    expect(source.split(needle).length - 1).toBe(1);
    expect(source).toContain("firstOrNull(serials)");
    expect(source).toContain("firstOrNull(online)");
    expect(source).toContain("if (focusListed(focus, online)) return focus");
  });
});
