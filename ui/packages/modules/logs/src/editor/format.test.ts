import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatLogLine, LOG_COLOR_SCHEME_CATALOG, LOG_COLOR_SCHEME_DEFAULT, type LogLine } from "@yohu/api";

import { ALL_LOG_DISPLAY_COLUMNS, DEFAULT_LOG_DISPLAY_COLUMNS, defaultLogColWidths, LOG_PAD_LEFT_CHARS } from "../layout";
import {
  clipPadField,
  columnTrackPx,
  contentColor,
  defaultFormatOptions,
  fieldChars,
  formatColumns,
  formatMessage,
  formatOptionsKey,
  formatParts,
  hangChars,
  javaStringHash,
  LOG_LEVEL_BADGE_CHARS,
  LOGCAT_TAG_SWATCHES,
  padLeftChars,
  splitDocField,
  tagSwatchIndex,
  trackTemplate,
} from "./format";

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

const all = defaultFormatOptions(ALL_LOG_DISPLAY_COLUMNS);
const shown = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS);

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

  it("formatOptionsKey 不含 chPx，量宽不触发 Document reload", () => {
    expect(formatOptionsKey({ ...all, chPx: 6 })).toBe(formatOptionsKey({ ...all, chPx: 10 }));
    expect(formatOptionsKey({ ...all, scheme: "logcat" })).not.toBe(formatOptionsKey(all));
  });

  it("左垫是设计尺常量，不跟 options.chPx / measureChPx", () => {
    expect(padLeftChars()).toBe(LOG_PAD_LEFT_CHARS);
    expect(padLeftChars()).toBe(2);
    const narrow = formatColumns({ ...all, chPx: 6 });
    const wide = formatColumns({ ...all, chPx: 10 });
    expect(narrow.find((col) => col.key === "ts")?.padLeft).toBe(2);
    expect(wide.find((col) => col.key === "ts")?.padLeft).toBe(2);
    expect(formatMessage(line(), { ...all, chPx: 6 }).text).toBe(formatMessage(line(), { ...all, chPx: 10 }).text);
  });

  it("拆字段时正文不含列垫，拼回等于文档", () => {
    const padded = clipPadField("Yohu", 10, "start");
    const split = splitDocField(`  ${padded} `);
    expect(split.body).toBe("Yohu");
    expect(split.lead.startsWith(" ")).toBe(true);
    expect(split.trail.endsWith(" ")).toBe(true);
    expect(`${split.lead}${split.body}${split.trail}`).toBe(`  ${padded} `);
    expect(splitDocField("  wdt_dump_cntcv CPU   ").body).toBe("wdt_dump_cntcv CPU");
    expect(splitDocField("     ").body).toBe("");
  });
});

describe("formatMessage", () => {
  it("消息是正文，不含 Tag 后冒号", () => {
    const msg = formatParts(formatMessage(line(), all)).find((part) => part.kind === "msg");
    expect(msg?.text.trimStart()).toBe("hello");
    expect(msg?.text.trimStart().startsWith(":")).toBe(false);
    expect(formatMessage(line(), all).text.includes(": hello")).toBe(false);
  });

  it("文档含 Tag 列 pad 空格，不是 formatLogLine 那种紧贴冒号", () => {
    const formatted = formatMessage(line({ tag: "Yohu" }), all);
    const tagPart = formatParts(formatted).find((part) => part.kind === "tag");
    expect(tagPart?.text.trimStart().startsWith("Yohu")).toBe(true);
    expect(tagPart?.text.endsWith(" ")).toBe(true);
    expect(tagPart!.text.length).toBeGreaterThan("Yohu".length);
    expect(formatted.text.includes("Yohu ")).toBe(true);
    expect(formatted.text).not.toBe(formatLogLine(line({ tag: "Yohu" })));
  });

  it("邻列之间有真实空格，数字与级别不会粘连", () => {
    const pid = formatParts(formatMessage(line(), all)).find((part) => part.kind === "pid");
    expect(pid?.text.endsWith(" ")).toBe(true);
    expect(formatMessage(line(), all).text).not.toMatch(/100I/);
    expect(formatMessage(line(), all).text).not.toMatch(/YohuI/);
  });

  it("级别只写官方 LevelFormat：3ch field + 1 空格，无 padLeft", () => {
    expect(LOG_LEVEL_BADGE_CHARS).toBe(3);
    const formatted = formatMessage(line(), all);
    const level = formatted.ranges.filter((range) => range.kind === "level");
    const field = level.find((range) => range.role === "field");
    expect(formatted.text.slice(field!.start, field!.end)).toBe(" I ");
    expect(level.filter((range) => range.role === "pad")).toHaveLength(1);
    const col = formatColumns(all).find((item) => item.key === "level");
    expect(col?.padLeft).toBe(0);
    expect(col?.chars).toBe(3);
    expect(col?.gutter).toBe(1);
    expect(formatParts(formatted).find((part) => part.kind === "level")?.text.length).toBe(4);
  });

  it("parts join 等于文档；解析失败行只有消息", () => {
    const formatted = formatMessage(line(), all);
    expect(formatParts(formatted).map((part) => part.text).join("")).toBe(formatted.text);
    expect(formatMessage(line({ level: "?", msg: "raw", tag: "", ts: "" }), all).text).toBe("raw");
    expect(formatMessage(line({ level: "?" }), all).headerChars).toBe(0);
  });

  it("关列后对应字段整段（含 pad）不进文档", () => {
    const hidden = formatMessage(line(), {
      display: { ts: false, uid: false, pid: true, tid: false, level: true, tag: false },
      widths: defaultLogColWidths(),
      chPx: 8,
      timeFormat: "datetime_millis",
    }).text;
    expect(hidden.includes("2026-01-01")).toBe(false);
    expect(hidden.includes("Yohu")).toBe(false);
    expect(hidden.includes("hello")).toBe(true);
  });

  it("表头 ch 轨道与文档字段同尺", () => {
    const parts = formatParts(formatMessage(line(), shown));
    for (const col of formatColumns(shown)) {
      if (col.chars == null) continue;
      const part = parts.find((item) => item.kind === col.key);
      expect(part?.text.length).toBe(col.padLeft + col.chars + col.gutter);
    }
    expect(trackTemplate(shown)).toBe("26ch 8ch 26ch 4ch minmax(10ch, 1fr)");
  });

  it("默认字段字符对齐内容；级别只认官方 3ch；Tag 紧接 LevelFormat；消息无 padLeft", () => {
    const cols = formatColumns(shown);
    expect(cols.find((col) => col.key === "ts")?.chars).toBe(23);
    expect(cols.find((col) => col.key === "pid")?.chars).toBe(5);
    expect(cols.find((col) => col.key === "level")?.chars).toBe(3);
    expect(cols.find((col) => col.key === "tag")?.gutter).toBe(0);
    expect(cols.find((col) => col.key === "msg")?.padLeft).toBe(0);
    expect(cols.find((col) => col.key === "pid")?.align).toBe("end");
    expect(formatParts(formatMessage(line({ pid: 100 }), shown)).find((part) => part.kind === "pid")?.text).toMatch(
      /  100 /,
    );
    expect(formatParts(formatMessage(line(), shown)).find((part) => part.kind === "level")?.text).toBe(" I  ");
    expect(formatMessage(line(), shown).headerChars).toBe(hangChars(shown));
    const tag24 = "A".repeat(24);
    expect(formatMessage(line({ tag: tag24 }), shown).text).toContain(`${tag24} I  hello`);
  });

  it("清单时间按 timeFormat 投影，默认仍是完整墙钟", () => {
    const clock = {
      ...shown,
      timeFormat: "time_millis" as const,
      widths: { ...shown.widths, ts: 12 * 8 },
    };
    expect(formatParts(formatMessage(line(), shown)).find((part) => part.kind === "ts")?.text).toContain(
      "2026-01-01 12:00:00.000",
    );
    expect(formatParts(formatMessage(line(), clock)).find((part) => part.kind === "ts")?.text).toContain("12:00:00.000");
    expect(formatParts(formatMessage(line(), clock)).find((part) => part.kind === "ts")?.text).not.toContain("2026-01-01");
    expect(formatColumns(clock).find((col) => col.key === "ts")?.chars).toBe(12);
  });

  it("拖字段 px 才按 ch 步进；轨道 px 回写会跳 pad+gutter", () => {
    const tag = formatColumns(shown).find((col) => col.key === "tag");
    expect(tag?.chars).toBeDefined();
    const fieldPx = shown.widths.tag;
    const trackPx = columnTrackPx(tag!, shown.chPx);
    expect(trackPx).toBeGreaterThan(fieldPx);
    const grown = formatColumns({
      ...shown,
      widths: { ...shown.widths, tag: fieldPx + shown.chPx },
    }).find((col) => col.key === "tag");
    expect(grown?.chars).toBe(tag!.chars! + 1);
    const jumped = formatColumns({
      ...shown,
      widths: { ...shown.widths, tag: trackPx },
    }).find((col) => col.key === "tag");
    expect(jumped?.chars).toBeGreaterThan(tag!.chars! + 1);
  });
});

describe("着色 range", () => {
  it("目录每项都有引擎，未知 id 回落默认", () => {
    for (const item of LOG_COLOR_SCHEME_CATALOG) {
      expect(contentColor(item.value).id).toBe(item.value);
    }
    expect(contentColor("darcula").id).toBe(LOG_COLOR_SCHEME_DEFAULT);
    expect(contentColor(undefined).id).toBe("yohu");
  });

  it("Yohu Fatal level 是行盒 wash，有左条；pad 不着色", () => {
    const engine = contentColor("yohu");
    expect(engine.bar).toBe("level");
    expect(engine.token("level", { level: "F", tag: "T" })).toEqual({
      tone: "wash",
      box: "line",
      style: {
        "--yohu-log-level-fg": "var(--yohu-fg-on)",
        "--yohu-log-level-bg": "var(--yohu-level-f)",
      },
    });
    const painted = formatMessage(line({ level: "E" }), { ...all, scheme: "darcula" });
    expect(painted.bar).toBe("level");
    expect(painted.barInk).toBe("var(--yohu-level-e)");
    expect(painted.ranges.filter((range) => range.role === "pad").every((range) => range.tone === undefined)).toBe(true);
    const ts = painted.ranges.find((range) => range.role === "field" && range.kind === "ts");
    expect(ts).toMatchObject({ tone: "ink", style: { "--yohu-log-ink": "var(--yohu-fg-3)" } });
  });

  it("Logcat 分 token，无左条", () => {
    const painted = formatMessage(line({ level: "I" }), { ...all, scheme: "logcat" });
    expect(painted.bar).toBe("none");
    const pid = painted.ranges.find((range) => range.role === "field" && range.kind === "pid");
    expect(pid?.tone).toBe("plain");
    const tag = painted.ranges.find((range) => range.role === "field" && range.kind === "tag");
    expect(tag?.style).toEqual({
      "--yohu-log-ink": `var(--yohu-logcat-tag-${tagSwatchIndex("Yohu")})`,
    });
    const level = painted.ranges.find((range) => range.role === "field" && range.kind === "level");
    expect(level).toMatchObject({ tone: "wash", box: "line" });
  });

  it("hash 对齐 Java String.hashCode，索引对齐 ColorPaletteManager abs%80", () => {
    expect(javaStringHash("foo")).toBe(101574);
    expect(tagSwatchIndex("foo")).toBe(101574 % LOGCAT_TAG_SWATCHES);
    const hash = javaStringHash("System");
    expect(hash).toBeLessThan(0);
    expect(tagSwatchIndex("System")).toBe(Math.abs(hash) % LOGCAT_TAG_SWATCHES);
  });
});

describe("measureChPx 不进 Formatter", () => {
  it("探针在 layout，format 不量 DOM，也不认识 Document / View", () => {
    const layout = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../layout.ts"), "utf-8");
    expect(layout).toContain('className = "yohu-logs__ch-probe"');
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf-8");
    expect(src).not.toMatch(/function measureChPx/);
    expect(src).not.toContain("document.createElement");
    expect(src).not.toContain("./document");
    expect(src).not.toContain("./view");
    expect(src).not.toContain("../layout");
  });
});
