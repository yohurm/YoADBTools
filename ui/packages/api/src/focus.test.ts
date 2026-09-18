import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { reconcileFocus, resolveTargetSerials, type SelectionMode } from "./focus";

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
