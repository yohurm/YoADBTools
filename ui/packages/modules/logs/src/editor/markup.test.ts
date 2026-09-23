import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatMessage, defaultFormatOptions, DEFAULT_LOG_DISPLAY_COLUMNS } from "./format";
import { markupRunsFromRanges } from "./markup-model";
import { nameMarkupRuns } from "./markup-policy";

import type { LogLine } from "@yohu/api";

function line(over: Partial<LogLine> = {}): LogLine {
  return {
    seq: 1,
    ts: "2026-01-01 12:00:00.000",
    pid: 100,
    tid: 200,
    level: "I",
    tag: "Yohu",
    msg: "hello",
    ...over,
  };
}

const shown = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS);

function srcOf(name: string): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), "utf-8");
}

describe("MarkupModel 与 Formatter 解耦", () => {
  it("Yohu Debug 级别是 wash，尾空格不进 run", () => {
    const painted = formatMessage(line({ level: "D" }), shown);
    const runs = markupRunsFromRanges(painted.ranges);
    const level = painted.ranges.find((range) => range.kind === "level" && range.tone);
    expect(level?.tone).toBe("wash");
    expect(runs.some((run) => run.from === level?.start && run.to === level?.end && run.paint.kind === "wash")).toBe(
      true,
    );
    const trail = painted.ranges.find((range) => range.kind === "level" && !range.tone);
    expect(trail).toBeTruthy();
    expect(runs.some((run) => run.from === trail?.start && run.to === trail?.end)).toBe(false);
  });

  it("Yohu 与 Logcat 已知级别都是 wash", () => {
    const fatal = markupRunsFromRanges(formatMessage(line({ level: "F" }), shown).ranges);
    expect(fatal.some((run) => run.paint.kind === "wash")).toBe(true);
    const logcat = markupRunsFromRanges(
      formatMessage(line({ level: "D" }), { ...shown, scheme: "logcat" }).ranges,
    );
    expect(logcat.some((run) => run.paint.kind === "wash")).toBe(true);
  });

  it("本层不碰 DOM / 选区 / 关键字 / Formatter", () => {
    const src = srcOf("markup-model.ts");
    expect(src).not.toContain("document.");
    expect(src).not.toContain("CSS.highlights");
    expect(src).not.toContain("./format");
    expect(src).not.toContain("./document");
    expect(src).not.toContain("./view");
    expect(src).not.toContain("./selection");
    expect(src).not.toContain("../highlight");
  });
});

describe("Markup 名", () => {
  it("ink / wash / mark 映射到 ::highlight 名，不写色值", () => {
    const debug = formatMessage(line({ level: "D" }), shown);
    const named = nameMarkupRuns(markupRunsFromRanges(debug.ranges));
    expect(named.some((run) => run.name === "yohu-wash-level-d")).toBe(true);
    expect(named.some((run) => run.name === "yohu-ink-level-d")).toBe(true);
    const fatal = formatMessage(line({ level: "F" }), shown);
    expect(nameMarkupRuns(markupRunsFromRanges(fatal.ranges)).some((run) => run.name === "yohu-wash-level-f")).toBe(
      true,
    );
    const logcat = formatMessage(line({ level: "D" }), { ...shown, scheme: "logcat" });
    expect(
      nameMarkupRuns(markupRunsFromRanges(logcat.ranges)).some((run) => run.name === "yohu-wash-logcat-level-d-bg"),
    ).toBe(true);
  });

  it("policy / registry / css 不回流 Formatter 与选区", () => {
    expect(srcOf("markup-policy.ts")).not.toContain("./format");
    expect(srcOf("markup-policy.ts")).not.toContain("./document");
    expect(srcOf("markup-policy.ts")).not.toContain("./selection");
    expect(srcOf("markup-policy.ts")).not.toContain("../highlight");
    expect(srcOf("markup-registry.ts")).not.toContain("./format");
    expect(srcOf("markup-registry.ts")).not.toContain("./document");
    expect(srcOf("markup-registry.ts")).not.toContain("./selection");
    expect(srcOf("markup-registry.ts")).not.toContain("../highlight");
    expect(srcOf("markup-registry.ts")).toContain("bindMarkupRuns");
    expect(srcOf("markup-wash.ts")).toContain("bindWashPaint");
    expect(srcOf("markup-wash.ts")).not.toContain("bindWashCells");
    expect(srcOf("markup-wash.ts")).not.toContain("createElement");
    expect(srcOf("markup-wash.ts")).not.toContain(".getBoundingClientRect");
    expect(srcOf("markup-wash.ts")).not.toContain("./format");
    expect(srcOf("markup-wash.ts")).not.toContain("./selection");
    const css = srcOf("markup.css");
    expect(css).toContain("::highlight(yohu-ink-level-d)");
    expect(css).toContain("::highlight(yohu-wash-level-d)");
    expect(css).toContain("::highlight(yohu-wash-level-i)");
    expect(css).toContain("::highlight(yohu-wash-level-f)");
    expect(css).toContain("::highlight(yohu-wash-logcat-level-d-bg)");
    expect(css).toContain("::highlight(yohu-log-mark)");
    expect(css).not.toMatch(/::highlight\(yohu-wash-level-d\)\s*\{[^}]*background-color/);
    expect(css).not.toMatch(/::highlight\(yohu-wash-logcat-level-d-bg\)\s*\{[^}]*background-color/);
    expect(css).not.toContain("::selection");
    expect(css).not.toContain("user-select");
    expect(css).not.toContain("data-tone");
    expect(css).not.toContain("data-box");
  });
});
