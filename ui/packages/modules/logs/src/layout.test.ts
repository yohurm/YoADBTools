import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { setColWidth } from "@yohu/ui";
import { defaultLogDocLayout, logDocTrackTemplate } from "./doc";
import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  LOG_COLUMNS,
  defaultLogColWidths,
  logFieldText,
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
    expect(logsCss).toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*inline/);
    expect(logsCss).not.toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*block/);
  });
});

describe("日志显示列", () => {
  it("默认不含 UID/TID，含时间/PID/级别/Tag/消息", () => {
    expect(logDocTrackTemplate(defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS))).toBe(
      "22ch 13ch 11ch 27ch minmax(10ch, 1fr)",
    );
    expect(visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS).map((c) => c.key)).toEqual([
      "ts",
      "pid",
      "level",
      "tag",
      "msg",
    ]);
  });

  it("关闭元数据列后消息仍在，轨道只留可见列", () => {
    const display = { ...DEFAULT_LOG_DISPLAY_COLUMNS, ts: false, uid: false, tag: false };
    expect(visibleLogColumns(display).map((c) => c.key)).toEqual(["pid", "level", "msg"]);
    expect(logDocTrackTemplate(defaultLogDocLayout(display))).toBe("13ch 11ch minmax(10ch, 1fr)");
  });

  it("全部元数据关闭只剩消息", () => {
    const display = { ts: false, uid: false, pid: false, tid: false, level: false, tag: false };
    expect(logDocTrackTemplate(defaultLogDocLayout(display))).toBe("minmax(10ch, 1fr)");
  });

  it("字段原文与表头同序，不含 pad / 列间空格", () => {
    const line = {
      seq: 1,
      ts: "01-01 12:00:00.000",
      uid: "shell",
      pid: 100,
      tid: 200,
      level: "I",
      tag: "Yohu",
      msg: "hello",
    };
    expect(visibleLogColumns(DEFAULT_LOG_DISPLAY_COLUMNS).map((col) => logFieldText(line, col.key))).toEqual([
      "01-01 12:00:00.000",
      "100",
      "I",
      "Yohu",
      "hello",
    ]);
  });

  it("写绝对宽度，不低于 min，消息列不拖", () => {
    const start = defaultLogColWidths();
    const tag = LOG_COLUMNS.find((col) => col.key === "tag")!;
    const pid = LOG_COLUMNS.find((col) => col.key === "pid")!;
    const msg = LOG_COLUMNS.find((col) => col.key === "msg")!;
    expect(setColWidth(start, tag, 212).tag).toBe(212);
    expect(setColWidth(start, pid, 10).pid).toBe(56);
    expect(setColWidth(start, msg, 200)).toBe(start);
  });
});

describe("日志级别色单源", () => {
  it("行 data-level 绑定 --yohu-log-ink，不再用 level/bar 双 class", () => {
    expect(logsCss).toContain('--yohu-log-ink: var(--yohu-fg-3)');
    expect(logsCss).toContain('[data-level="e"] { --yohu-log-ink: var(--yohu-level-e); }');
    expect(logsCss).toContain('[data-level="f"] { --yohu-log-ink: var(--yohu-level-f-bg); }');
    expect(logsCss).toContain(".yohu-logs__row-tag {");
    expect(logsCss).toContain("color: var(--yohu-log-ink)");
    expect(logsCss).not.toMatch(/\.yohu-logs__row-level\s*\{[^}]*text-align:\s*center/);
    expect(logsCss).toContain('[data-level="e"] .yohu-logs__row-msg');
    expect(logsCss).not.toContain(".yohu-logs__level--");
    expect(logsCss).not.toContain(".yohu-logs__row--bar-");
    expect(logsCss).toContain(".yohu-logs__levels {");
    expect(logsCss).toContain("--yohu-log-fill: color-mix(in srgb, var(--yohu-log-ink) 20%, var(--yohu-surface))");
    expect(logsCss).not.toMatch(/box-shadow:\s*inset 0 calc\(-1 \* var\(--yohu-stroke-accent\)\)/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row-tag\s*\{\s*color:\s*var\(--yohu-accent\)/);
  });
});
