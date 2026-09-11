import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";

import { ALL_LOG_DISPLAY_COLUMNS, formatLogLine } from "./format";
import {
  clipPadField,
  defaultLogDocLayout,
  fieldChars,
  formatLogDoc,
  formatLogDocParts,
  joinLogDoc,
  logDocColumns,
  logDocTrackPx,
  logDocTrackTemplate,
  splitLevelGlyph,
} from "./doc";
import { DEFAULT_LOG_DISPLAY_COLUMNS, defaultLogColWidths } from "./layout";

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

describe("clipPadField / fieldChars", () => {
  it("短字段 padEnd 的空格进文档（Logcat TagFormat）", () => {
    expect(clipPadField("Yohu", 10, "start")).toBe("Yohu      ");
    expect(clipPadField("Yohu", 10, "start").length).toBe(10);
  });

  it("数字列 padStart，前导空格也进文档", () => {
    expect(clipPadField("100", 8, "end")).toBe("     100");
  });

  it("超出列宽省略，仍是固定字符宽", () => {
    expect(clipPadField("ActivityManager", 8, "start")).toBe("Activit…");
    expect(clipPadField("ActivityManager", 8, "start").length).toBe(8);
  });

  it("列像素换成字符数，不低于下限；用设计尺不跟 measureChPx", () => {
    expect(fieldChars(192, 10)).toBe(24);
    expect(fieldChars(40, 10)).toBe(10);
    expect(fieldChars(184, 23)).toBe(23);
  });
});

describe("formatLogDoc", () => {
  const layout = defaultLogDocLayout(ALL_LOG_DISPLAY_COLUMNS);

  it("消息是正文，不含 Tag 后冒号（对照 AS MessageFormatter.accumulate(message)）", () => {
    const msg = formatLogDocParts(line(), layout).find((part) => part.kind === "msg");
    expect(msg?.text.trimStart()).toBe("hello");
    expect(msg?.text.trimStart().startsWith(":")).toBe(false);
    expect(formatLogDoc(line(), layout).includes(": hello")).toBe(false);
  });

  it("文档含 Tag 列 pad 空格，不是 formatLogLine 那种紧贴冒号", () => {
    const item = line({ tag: "Yohu" });
    const doc = formatLogDoc(item, layout);
    const tagPart = formatLogDocParts(item, layout).find((part) => part.kind === "tag");
    expect(tagPart?.text.trimStart().startsWith("Yohu")).toBe(true);
    expect(tagPart?.text.endsWith(" ")).toBe(true);
    expect(tagPart!.text.length).toBeGreaterThan("Yohu".length);
    expect(doc.includes("Yohu ")).toBe(true);
    expect(doc).not.toBe(formatLogLine(item));
  });

  it("邻列之间有真实空格，数字与级别不会粘连", () => {
    const pid = formatLogDocParts(line(), layout).find((part) => part.kind === "pid");
    expect(pid?.text.endsWith(" ")).toBe(true);
    expect(formatLogDoc(line(), layout)).not.toMatch(/100I/);
    expect(formatLogDoc(line(), layout)).not.toMatch(/YohuI/);
  });

  it("级别字母与后面的 pad 分开，Fatal 反色只包字母", () => {
    expect(splitLevelGlyph("I        ")).toEqual({ lead: "", letter: "I", pad: "        " });
    expect(splitLevelGlyph("  I        ")).toEqual({ lead: "  ", letter: "I", pad: "        " });
  });

  it("parts join 等于文档；解析失败行只有消息", () => {
    const item = line();
    expect(joinLogDoc(formatLogDocParts(item, layout))).toBe(formatLogDoc(item, layout));
    expect(formatLogDoc(line({ level: "?", msg: "raw", tag: "", ts: "" }), layout)).toBe("raw");
  });

  it("关列后对应字段整段（含 pad）不进文档", () => {
    const hidden = formatLogDoc(line(), {
      display: { ts: false, uid: false, pid: true, tid: false, level: true, tag: false },
      widths: defaultLogColWidths(),
      chPx: 8,
      timeFormat: "datetime_millis",
    });
    expect(hidden.includes("2026-01-01")).toBe(false);
    expect(hidden.includes("Yohu")).toBe(false);
    expect(hidden.includes("hello")).toBe(true);
  });

  it("表头 ch 轨道与文档字段同尺", () => {
    const layout = defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS);
    const parts = formatLogDocParts(line(), layout);
    for (const col of logDocColumns(layout)) {
      if (col.chars == null) continue;
      const part = parts.find((item) => item.kind === col.key);
      expect(part?.text.length).toBe(col.padLeft + col.chars + col.gutter);
    }
    expect(logDocTrackTemplate(layout)).toBe("26ch 8ch 27ch 7ch minmax(10ch, 1fr)");
  });

  it("默认字段字符对齐内容；级别槽按表头全角 4ch；PID 与规格同为 end", () => {
    const layout = defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS);
    const cols = logDocColumns(layout);
    expect(cols.find((col) => col.key === "ts")?.chars).toBe(23);
    expect(cols.find((col) => col.key === "pid")?.chars).toBe(5);
    expect(cols.find((col) => col.key === "level")?.chars).toBe(4);
    expect(cols.find((col) => col.key === "pid")?.align).toBe("end");
    expect(formatLogDocParts(line({ pid: 100 }), layout).find((part) => part.kind === "pid")?.text).toMatch(/  100 /);
    expect(formatLogDocParts(line(), layout).find((part) => part.kind === "level")?.text).toMatch(/I {3} /);
  });

  it("清单时间按 timeFormat 投影，默认仍是完整墙钟", () => {
    const full = defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS);
    const clock = {
      ...full,
      timeFormat: "time_millis" as const,
      widths: { ...full.widths, ts: 12 * 8 },
    };
    expect(formatLogDocParts(line(), full).find((part) => part.kind === "ts")?.text).toContain("2026-01-01 12:00:00.000");
    expect(formatLogDocParts(line(), clock).find((part) => part.kind === "ts")?.text).toContain("12:00:00.000");
    expect(formatLogDocParts(line(), clock).find((part) => part.kind === "ts")?.text).not.toContain("2026-01-01");
    expect(logDocColumns(clock).find((col) => col.key === "ts")?.chars).toBe(12);
  });

  it("拖字段 px 才按 ch 步进；轨道 px 回写会跳 pad+gutter", () => {
    const layout = defaultLogDocLayout(DEFAULT_LOG_DISPLAY_COLUMNS);
    const tag = logDocColumns(layout).find((col) => col.key === "tag");
    expect(tag?.chars).toBeDefined();
    const fieldPx = layout.widths.tag;
    const trackPx = logDocTrackPx(tag!, layout.chPx);
    expect(trackPx).toBeGreaterThan(fieldPx);

    const grown = logDocColumns({
      ...layout,
      widths: { ...layout.widths, tag: fieldPx + layout.chPx },
    }).find((col) => col.key === "tag");
    expect(grown?.chars).toBe(tag!.chars! + 1);

    const jumped = logDocColumns({
      ...layout,
      widths: { ...layout.widths, tag: trackPx },
    }).find((col) => col.key === "tag");
    expect(jumped?.chars).toBeGreaterThan(tag!.chars! + 1);
  });
});

describe("measureChPx", () => {
  it("探针是行内 ch-probe，不套通栏 row class", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "doc.ts"), "utf-8");
    expect(src).toContain('className = "yohu-logs__ch-probe"');
    expect(src).not.toMatch(/measureChPx[\s\S]*yohu-logs__row/);
  });
});
