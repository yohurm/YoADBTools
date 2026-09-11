import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { setColWidth } from "@yohu/ui";
import { defaultLogDocLayout, logDocTrackTemplate } from "./doc";
import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  LOG_COLUMNS,
  defaultLogColWidths,
  headerLabelChars,
  logFieldText,
  logSlotChars,
  visibleLogColumns,
} from "./layout";

function loadLogsCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/logs.css"),
    resolve(process.cwd(), "packages/modules/logs/src/logs.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const logsCss = loadLogsCss();

describe("日志表头布局契约", () => {
  it("表头钉在虚拟列表外，不随行滚动", () => {
    expect(logsCss).toMatch(/\.yohu-logs__list\s*\{[^}]*display:\s*flex/);
    expect(logsCss).toMatch(/\.yohu-logs__cols--head\s*\{[^}]*flex-shrink:\s*0/);
    expect(logsCss).toContain("var(--yohu-row-height-header)");
    expect(logsCss).toMatch(/\.yohu-logs__list-body\s*\{[^}]*overflow:\s*hidden/);
  });

  it("列轨道不在模块 CSS 写死，交给 YoColFrame", () => {
    expect(logsCss).not.toMatch(/\.yohu-logs__cols\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*user-select:\s*text/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*white-space:\s*pre/);
    expect(logsCss).not.toContain("::highlight(yohu-log-sel)");
    expect(logsCss).not.toContain("yohu-logs__sel-layer");
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s+\.yohu-col-cell/);
    expect(logsCss).toContain("var(--yohu-text-sel)");
    expect(logsCss).toMatch(/\.yohu-logs__list ::selection\s*\{\s*background-color:\s*var\(--yohu-text-sel\)/);
    expect(logsCss).not.toMatch(/\.yohu-logs__list ::selection\s*\{\s*background:\s*transparent/);
    expect(logsCss).not.toContain('[data-select="cell"]');
    expect(logsCss).not.toContain(".yohu-logs__cell");
    expect(logsCss).toContain("yohu-logs__row--picked");
    expect(logsCss).not.toContain("yohu-logs__list-body--picking");
    expect(logsCss).not.toContain("yohu-col-header");
    expect(logsCss).not.toContain("--yohu-col-tracks");
    expect(logsCss).not.toContain("--yohu-col-cell-pad");
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*border-bottom:/);
    expect(logsCss).not.toMatch(/\.yohu-virtual-list__row\s*\{[^}]*border-bottom:/);
    expect(logsCss).not.toContain(".yohu-dialog__body");
    expect(logsCss).not.toContain(".yohu-button");
    expect(logsCss).not.toContain(".yohu-text-field");
    expect(logsCss).not.toContain(".yohu-tooltip__anchor");
    const dialogCandidates = [
      resolve(process.cwd(), "src/NewSessionDialog.tsx"),
      resolve(process.cwd(), "packages/modules/logs/src/NewSessionDialog.tsx"),
    ];
    const dialog =
      dialogCandidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ??
      "";
    expect(dialog).toContain('bodyOverflow="hidden"');
    expect(logsCss).toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*inline/);
    expect(logsCss).not.toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*block/);
  });
});

describe("日志显示列", () => {
  it("默认不含 UID/TID，列序时间/PID/Tag/级别/消息", () => {
    expect(logDocTrackTemplate(defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS))).toBe(
      "26ch 8ch 27ch 7ch minmax(10ch, 1fr)",
    );
    expect(visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS).map((c) => c.key)).toEqual([
      "ts",
      "pid",
      "tag",
      "level",
      "msg",
    ]);
  });

  it("关闭元数据列后消息仍在，轨道只留可见列", () => {
    const display = { ...DEFAULT_LOG_DISPLAY_COLUMNS, ts: false, uid: false, tag: false };
    expect(visibleLogColumns(display).map((c) => c.key)).toEqual(["pid", "level", "msg"]);
    expect(logDocTrackTemplate(defaultLogDocLayout(display))).toBe("8ch 7ch minmax(10ch, 1fr)");
  });

  it("全部元数据关闭只剩消息", () => {
    const display = { ts: false, uid: false, pid: false, tid: false, level: false, tag: false };
    expect(logDocTrackTemplate(defaultLogDocLayout(display))).toBe("minmax(10ch, 1fr)");
  });

  it("字段原文与表头同序，不含 pad / 列间空格", () => {
    const line = {
      seq: 1,
      ts: "2026-01-01 12:00:00.000",
      uid: "shell",
      pid: 100,
      tid: 200,
      level: "I",
      tag: "Yohu",
      msg: "hello",
    };
    expect(visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS).map((col) => logFieldText(line, col.key))).toEqual([
      "2026-01-01 12:00:00.000",
      "100",
      "Yohu",
      "I",
      "hello",
    ]);
  });

  it("表头全角计入列尺：级别 4ch，不被一字母字段压扁", () => {
    expect(headerLabelChars("级别")).toBe(4);
    expect(headerLabelChars("时间")).toBe(4);
    expect(headerLabelChars("PID")).toBe(3);
    expect(logSlotChars("level", "级别")).toBe(4);
    expect(logSlotChars("pid", "PID")).toBe(5);
    expect(logSlotChars("ts", "时间", "time_millis")).toBe(12);
    expect(LOG_COLUMNS.find((col) => col.key === "level")?.minWidth).toBe(32);
  });

  it("写绝对宽度，不低于 min，消息列不拖", () => {
    const start = defaultLogColWidths();
    const tag = LOG_COLUMNS.find((col) => col.key === "tag")!;
    const pid = LOG_COLUMNS.find((col) => col.key === "pid")!;
    const msg = LOG_COLUMNS.find((col) => col.key === "msg")!;
    expect(setColWidth(start, tag, 212).tag).toBe(212);
    expect(setColWidth(start, pid, 10).pid).toBe(40);
    expect(setColWidth(start, msg, 200)).toBe(start);
  });

  it("visibleLogColumns 复用 LOG_COLUMNS 引用，表头 For 拖宽才不重挂", () => {
    const a = visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS);
    const b = visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS);
    expect(a.map((col) => col.key)).toEqual(b.map((col) => col.key));
    for (const col of a) {
      expect(col).toBe(LOG_COLUMNS.find((item) => item.key === col.key));
      expect(col).toBe(b.find((item) => item.key === col.key));
    }
  });

  it("表头 For 遍历稳定规格，拖条写字段 px", () => {
    const candidates = [
      resolve(process.cwd(), "src/LogAnalyzerView.tsx"),
      resolve(process.cwd(), "packages/modules/logs/src/LogAnalyzerView.tsx"),
    ];
    const view =
      candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ?? "";
    expect(view).toContain("visibleLogColumns(displayColumns())");
    expect(view).not.toContain("logDocColumns(docLayout())");
    expect(view).not.toContain("logDocTrackPx");
    expect(view).toContain("width={logStore.state.colWidths[col.key]}");
    expect(view).toContain("align={col.align}");
    expect(view).toContain("layout={docLayout}");
    expect(view).not.toContain("layout={docLayout()}");
  });
});

describe("日志级别色单源", () => {
  it("行 --yohu-log-ink 由 View 写入，CSS 不再列 V–F 映射", () => {
    expect(logsCss).toContain('--yohu-log-ink: var(--yohu-fg-3)');
    expect(logsCss).not.toMatch(/\[data-level="[vdiwe]"\]/);
    expect(logsCss).not.toContain("--yohu-level-f-bg");
    expect(logsCss).toContain('[data-paint="invert"]');
    expect(logsCss).toContain("[data-tint-msg]");
    expect(logsCss).toContain(".yohu-logs__row-tag {");
    expect(logsCss).toContain("color: var(--yohu-log-ink)");
    expect(logsCss).not.toMatch(/\.yohu-logs__row-level\s*\{[^}]*text-align:\s*center/);
    expect(logsCss).toContain("[data-tint-msg] .yohu-logs__row-msg");
    expect(logsCss).not.toContain(".yohu-logs__level--");
    expect(logsCss).not.toContain(".yohu-logs__row--bar-");
    expect(logsCss).toContain(".yohu-logs__levels {");
    expect(logsCss).toContain("--yohu-log-fill: color-mix(in srgb, var(--yohu-log-ink) 20%, var(--yohu-surface))");
    expect(logsCss).toContain("--yohu-button-ink: var(--yohu-log-ink)");
    expect(logsCss).toContain("--yohu-button-fill: var(--yohu-log-fill)");
    expect(logsCss).not.toContain(".yohu-button");
    expect(logsCss).not.toContain(".yohu-text-field");
    expect(logsCss).not.toContain("[aria-pressed]");
    expect(logsCss).not.toContain(".yohu-tooltip__anchor");
    expect(logsCss).not.toContain(".yohu-virtual-list");
    expect(logsCss).not.toMatch(/box-shadow:\s*inset 0 calc\(-1 \* var\(--yohu-stroke-accent\)\)/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row-tag\s*\{\s*color:\s*var\(--yohu-accent\)/);
  });
});
