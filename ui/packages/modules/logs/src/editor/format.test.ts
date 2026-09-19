import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatLogLine, LOG_COLOR_SCHEME_CATALOG, LOG_COLOR_SCHEME_DEFAULT, type LogLine } from "@yohu/api";

import { ALL_LOG_DISPLAY_COLUMNS, DEFAULT_LOG_DISPLAY_COLUMNS } from "../layout";
import {
  contentColor,
  defaultFormatOptions,
  formatColumns,
  formatMessage,
  formatOptionsKey,
  formatParts,
  formatProcessThread,
  formatTag,
  formatTimestamp,
  formatUid,
  hangChars,
  javaStringHash,
  LEVEL_FORMAT_WIDTH,
  LOGCAT_TAG_SWATCHES,
  PROCESS_BOTH_WIDTH,
  PROCESS_PID_WIDTH,
  processThreadStyle,
  shortenTextWithEllipsis,
  tagMaxLength,
  tagSwatchIndex,
  timestampWidth,
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

describe("官方 Format 分段", () => {
  it("TimestampFormat 自带尾空格，DATETIME=24 TIME=13", () => {
    expect(timestampWidth("datetime_millis")).toBe(24);
    expect(timestampWidth("time_millis")).toBe(13);
    expect(formatTimestamp("2026-01-01 12:00:00.000", "datetime_millis")).toBe("2026-01-01 12:00:00.000 ");
    expect(formatTimestamp("2026-01-01 12:00:00.000", "time_millis")).toBe("12:00:00.000 ");
    expect(formatTimestamp("2026-01-01 12:00:00.000", "datetime_millis").length).toBe(24);
  });

  it("ProcessThreadFormat PID 左齐 6ch，BOTH 是 %5d-%-5d 共 12ch", () => {
    expect(processThreadStyle(DEFAULT_LOG_DISPLAY_COLUMNS)).toBe("pid");
    expect(processThreadStyle(ALL_LOG_DISPLAY_COLUMNS)).toBe("both");
    expect(formatProcessThread(line(), "pid")).toBe("100   ");
    expect(formatProcessThread(line(), "pid").length).toBe(PROCESS_PID_WIDTH);
    expect(formatProcessThread(line(), "both")).toBe("  100-200   ");
    expect(formatProcessThread(line(), "both").length).toBe(PROCESS_BOTH_WIDTH);
    expect(formatProcessThread({ pid: 21882, tid: 200 }, "both")).toBe("21882-200   ");
  });

  it("TagFormat padEnd(max+1)，超长中间省略号，空 Tag 写 <no-tag>", () => {
    expect(formatTag("Yohu", 23)).toBe("Yohu".padEnd(24));
    expect(formatTag("Yohu", 23).length).toBe(24);
    expect(formatTag("", 23)).toBe("<no-tag>".padEnd(24));
    const long = "A".repeat(24);
    expect(formatTag(long, 23)).toBe(`${shortenTextWithEllipsis(long, 23, 10)} `);
    expect(formatTag(long, 23).length).toBe(24);
    expect(formatTag(long, 23)).toContain("...");
    expect(formatTag(long, 23)).not.toContain("…");
  });

  it("UidFormat 是定宽 8 + 尾空格", () => {
    expect(formatUid("shell")).toBe("shell    ");
    expect(formatUid("shell").length).toBe(9);
    expect(formatUid(undefined).length).toBe(9);
  });

  it("formatOptionsKey 不含量宽，只跟显示列 / 时间 / Tag 轨 / 配色", () => {
    expect(formatOptionsKey({ ...all, scheme: "logcat" })).not.toBe(formatOptionsKey(all));
    expect(formatOptionsKey({ ...all, tagWidthPx: all.tagWidthPx + 8 })).not.toBe(formatOptionsKey(all));
    expect(all).not.toHaveProperty("layout");
    expect(all).not.toHaveProperty("log_line_layout");
  });

  it("Format.width 不跟 measureChPx", () => {
    expect(formatColumns(all).find((col) => col.key === "ts")?.width).toBe(24);
    expect(formatColumns(all).find((col) => col.key === "pid")?.width).toBe(12);
  });
});

describe("formatMessage", () => {
  it("消息是正文，不含 Tag 后冒号", () => {
    const msg = formatParts(formatMessage(line(), all)).find((part) => part.kind === "msg");
    expect(msg?.text.trimStart()).toBe("hello");
    expect(msg?.text.trimStart().startsWith(":")).toBe(false);
    expect(formatMessage(line(), all).text.includes(": hello")).toBe(false);
  });

  it("文档含 TagFormat 尾空格，不是 formatLogLine 那种紧贴冒号", () => {
    const formatted = formatMessage(line({ tag: "Yohu" }), all);
    const tagPart = formatParts(formatted).find((part) => part.kind === "tag");
    expect(tagPart?.text.startsWith("Yohu")).toBe(true);
    expect(tagPart?.text.endsWith(" ")).toBe(true);
    expect(tagPart!.text.length).toBe(24);
    expect(formatted.text.includes("Yohu ")).toBe(true);
    expect(formatted.text).not.toBe(formatLogLine(line({ tag: "Yohu" })));
  });

  it("邻列之间有真实空格，数字与级别不会粘连", () => {
    const pid = formatParts(formatMessage(line(), all)).find((part) => part.kind === "pid");
    expect(pid?.text).toBe("  100-200   ");
    expect(formatMessage(line(), all).text).not.toMatch(/100I/);
    expect(formatMessage(line(), all).text).not.toMatch(/YohuI/);
  });

  it("级别只写官方 LevelFormat：3ch 着色 + 1 个未着色空格", () => {
    const formatted = formatMessage(line(), all);
    const level = formatted.ranges.filter((range) => range.kind === "level");
    expect(formatted.text.slice(level[0]!.start, level[0]!.end)).toBe(" I ");
    expect(level[0]?.tone).toBe("ink");
    expect(level[1]?.tone).toBeUndefined();
    expect(formatted.text.slice(level[1]!.start, level[1]!.end)).toBe(" ");
    expect(formatColumns(all).find((item) => item.key === "level")?.width).toBe(LEVEL_FORMAT_WIDTH);
    expect(formatParts(formatted).find((part) => part.kind === "level")?.text.length).toBe(4);
  });

  it("parts join 等于文档；解析失败行只有消息", () => {
    const formatted = formatMessage(line(), all);
    expect(formatParts(formatted).map((part) => part.text).join("")).toBe(formatted.text);
    expect(formatMessage(line({ level: "?", msg: "raw", tag: "", ts: "" }), all).text).toBe("raw");
    expect(formatMessage(line({ level: "?" }), all).headerChars).toBe(0);
  });

  it("关列后对应字段整段（含尾空格）不进文档", () => {
    const hidden = formatMessage(line(), {
      display: { ts: false, uid: false, pid: true, tid: false, level: true, tag: false },
      tagWidthPx: all.tagWidthPx,
      timeFormat: "datetime_millis",
    }).text;
    expect(hidden.includes("2026-01-01")).toBe(false);
    expect(hidden.includes("Yohu")).toBe(false);
    expect(hidden.includes("hello")).toBe(true);
    expect(hidden.startsWith("100   ")).toBe(true);
  });

  it("表头 ch 轨道与文档字段同尺", () => {
    const parts = formatParts(formatMessage(line(), shown));
    for (const col of formatColumns(shown)) {
      if (col.width == null) continue;
      const part = parts.find((item) => item.kind === col.key);
      expect(part?.text.length).toBe(col.width);
    }
    expect(trackTemplate(shown)).toBe("24ch 6ch 24ch 4ch minmax(10ch, 1fr)");
  });

  it("默认字段对齐官方 width；PID 左齐；Tag 紧接 LevelFormat", () => {
    const cols = formatColumns(shown);
    expect(cols.find((col) => col.key === "ts")?.width).toBe(24);
    expect(cols.find((col) => col.key === "pid")?.width).toBe(6);
    expect(cols.find((col) => col.key === "level")?.width).toBe(4);
    expect(cols.find((col) => col.key === "msg")?.width).toBeNull();
    expect(formatParts(formatMessage(line({ pid: 100 }), shown)).find((part) => part.kind === "pid")?.text).toBe(
      "100   ",
    );
    expect(formatParts(formatMessage(line(), shown)).find((part) => part.kind === "level")?.text).toBe(" I  ");
    expect(formatMessage(line(), shown).headerChars).toBe(hangChars(shown));
    const tag23 = "A".repeat(23);
    expect(formatMessage(line({ tag: tag23 }), shown).text).toContain(`${tag23}  I  hello`);
  });

  it("清单时间按 timeFormat 投影，默认仍是完整墙钟", () => {
    const clock = {
      ...shown,
      timeFormat: "time_millis" as const,
    };
    expect(formatParts(formatMessage(line(), shown)).find((part) => part.kind === "ts")?.text).toBe(
      "2026-01-01 12:00:00.000 ",
    );
    expect(formatParts(formatMessage(line(), clock)).find((part) => part.kind === "ts")?.text).toBe("12:00:00.000 ");
    expect(formatColumns(clock).find((col) => col.key === "ts")?.width).toBe(13);
    expect(trackTemplate(clock)).toBe("13ch 6ch 24ch 4ch minmax(10ch, 1fr)");
  });

  it("只有 Tag 轨跟拖像素，轨道宽等于 Format.width", () => {
    const tag = formatColumns(shown).find((col) => col.key === "tag");
    expect(tag?.width).toBe(24);
    expect(tagMaxLength(shown)).toBe(23);
    const grown = formatColumns({
      ...shown,
      tagWidthPx: shown.tagWidthPx + 8,
    }).find((col) => col.key === "tag");
    expect(grown?.width).toBe(25);
    expect(tagMaxLength({ ...shown, tagWidthPx: shown.tagWidthPx + 8 })).toBe(24);
  });

  it("PID+TID 合成 BOTH，文档没有单独 TID 段", () => {
    const parts = formatParts(formatMessage(line(), all));
    expect(parts.find((part) => part.kind === "tid")).toBeUndefined();
    expect(parts.find((part) => part.kind === "pid")?.text).toBe("  100-200   ");
    expect(formatColumns(all).map((col) => col.key)).toEqual(["ts", "uid", "pid", "tag", "level", "msg"]);
    expect(trackTemplate(all)).toBe("24ch 9ch 12ch 24ch 4ch minmax(10ch, 1fr)");
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

  it("Yohu Fatal level 是行盒 wash，有左条；LevelFormat 尾空格不着色", () => {
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
    const level = painted.ranges.filter((range) => range.kind === "level");
    expect(level[0]?.tone).toBe("ink");
    expect(level[1]?.tone).toBeUndefined();
    const ts = painted.ranges.find((range) => range.kind === "ts");
    expect(ts).toMatchObject({ tone: "ink", style: { "--yohu-log-ink": "var(--yohu-fg-3)" } });
  });

  it("Logcat 分 token，无左条；时间/进程无色键", () => {
    const painted = formatMessage(line({ level: "I" }), { ...all, scheme: "logcat" });
    expect(painted.bar).toBe("none");
    const pid = painted.ranges.find((range) => range.kind === "pid");
    expect(pid?.tone).toBeUndefined();
    const tag = painted.ranges.find((range) => range.kind === "tag");
    expect(tag?.style).toEqual({
      "--yohu-log-ink": `var(--yohu-logcat-tag-${tagSwatchIndex("Yohu")})`,
    });
    const level = painted.ranges.find((range) => range.kind === "level" && range.tone);
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
