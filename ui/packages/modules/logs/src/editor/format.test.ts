import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatLogLine, LOG_COLOR_SCHEME_CATALOG, LOG_COLOR_SCHEME_DEFAULT, type LogLine } from "@yohu/api";

import {
  ALL_LOG_DISPLAY_COLUMNS,
  DEFAULT_LOG_DISPLAY_COLUMNS,
  TAG_DEFAULT_MAX,
  TAG_DEFAULT_WIDTH_PX,
  appNameOf,
  contentColor,
  defaultFormatOptions,
  formatAppName,
  formatColumns,
  formatMessage,
  formatOptionsKey,
  formatParts,
  formatProcessThread,
  formatTag,
  formatTimestamp,
  formatUid,
  headerColumns,
  headerWidth,
  javaStringHash,
  LEVEL_FORMAT_WIDTH,
  logDocTrackTemplate,
  logFieldLabel,
  LOGCAT_TAG_SWATCHES,
  PROCESS_BOTH_WIDTH,
  PROCESS_PID_WIDTH,
  processThreadStyle,
  shortenTextWithEllipsis,
  tagMaxLength,
  tagSwatchIndex,
  timestampWidth,
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
    expect(formatTimestamp("2026-01-01 12:00:00.000", "datetime_millis").length).toBe(24);
  });

  it("默认 STANDARD 是 BOTH + AppName，headerWidth=100", () => {
    expect(processThreadStyle(DEFAULT_LOG_DISPLAY_COLUMNS)).toBe("both");
    expect(formatProcessThread(line(), "both")).toBe("  100-200   ");
    expect(formatProcessThread(line(), "both").length).toBe(PROCESS_BOTH_WIDTH);
    expect(formatProcessThread(line(), "pid").length).toBe(PROCESS_PID_WIDTH);
    expect(headerWidth(shown)).toBe(24 + 12 + 24 + 36 + 4);
  });

  it("TagFormat padEnd(max+1)，空 Tag 是空格不是 <no-tag>", () => {
    expect(formatTag("Yohu", 23)).toBe("Yohu".padEnd(24));
    expect(formatTag("", 23)).toBe(" ".padEnd(24));
    const long = "A".repeat(24);
    expect(formatTag(long, 23)).toBe(`${shortenTextWithEllipsis(long, 23, 10)} `);
  });

  it("AppNameFormat 默认 35+1，超长保留末尾", () => {
    expect(formatAppName("com.foo").length).toBe(36);
    expect(appNameOf(line({ pid: 0 }))).toBe("kernel");
    expect(appNameOf(line({ pid: 9 }))).toBe("pid-9");
    expect(appNameOf(line({ pid: 9 }), { 9: "com.foo" })).toBe("com.foo");
    const long = "android.hardware.thermal-service.pixel";
    expect(formatAppName(long).length).toBe(36);
    expect(formatAppName(long)).toContain("...");
  });

  it("UidFormat 是定宽 8 + 尾空格", () => {
    expect(formatUid("shell")).toBe("shell    ");
    expect(formatUid("shell").length).toBe(9);
  });

  it("formatOptionsKey 含 softWrap 与 colChars，不含 appNames", () => {
    expect(formatOptionsKey({ ...all, scheme: "logcat" })).not.toBe(formatOptionsKey(all));
    expect(formatOptionsKey({ ...all, softWrap: true })).not.toBe(formatOptionsKey(all));
    expect(formatOptionsKey({ ...all, colChars: { tag: 30 } })).not.toBe(formatOptionsKey(all));
    expect(all).not.toHaveProperty("log_line_layout");
  });
});

describe("formatMessage", () => {
  it("消息是正文，不含 Tag 后冒号", () => {
    const msg = formatParts(formatMessage(line(), all)).find((part) => part.kind === "msg");
    expect(msg?.text.trimStart()).toBe("hello");
    expect(formatMessage(line(), all).text.includes(": hello")).toBe(false);
  });

  it("Soft-Wrap 关把硬换行垫成 headerWidth 空格", () => {
    const formatted = formatMessage(line({ msg: "one\ntwo" }), shown);
    expect(formatted.text).toContain("\n");
    const cont = formatted.text.split("\n")[1] ?? "";
    expect(cont.startsWith(" ".repeat(formatted.headerChars))).toBe(true);
    expect(cont.trimStart()).toBe("two");
    expect(formatted.headerChars).toBe(headerWidth(shown));
  });

  it("Soft-Wrap 开不垫悬挂空格", () => {
    const formatted = formatMessage(line({ msg: "one\ntwo" }), { ...shown, softWrap: true });
    expect(formatted.text.split("\n")[1]).toBe("two");
  });

  it("级别只写官方 LevelFormat：3ch 着色 + 1 个未着色空格", () => {
    const formatted = formatMessage(line(), shown);
    const level = formatted.ranges.filter((range) => range.kind === "level");
    expect(formatted.text.slice(level[0]!.start, level[0]!.end)).toBe(" I ");
    expect(level[1]?.tone).toBeUndefined();
    expect(formatColumns(shown).find((item) => item.key === "level")?.width).toBe(LEVEL_FORMAT_WIDTH);
  });

  it("parts join 等于文档；解析失败行只有消息", () => {
    const formatted = formatMessage(line(), shown);
    expect(formatParts(formatted).map((part) => part.text).join("")).toBe(formatted.text);
    expect(formatMessage(line({ level: "?", msg: "raw", tag: "", ts: "" }), shown).text).toBe("raw");
  });

  it("关列后对应字段整段不进文档", () => {
    const hidden = formatMessage(line(), {
      display: { ts: false, uid: false, pid: true, tid: false, tag: false, app: false, level: true },
      tagWidthPx: shown.tagWidthPx,
      timeFormat: "datetime_millis",
    }).text;
    expect(hidden.includes("2026-01-01")).toBe(false);
    expect(hidden.includes("Yohu")).toBe(false);
    expect(hidden.includes("hello")).toBe(true);
    expect(hidden.startsWith("100   ")).toBe(true);
  });

  it("默认字段对齐官方 width；AppName 在 Level 前", () => {
    const parts = formatParts(formatMessage(line(), shown));
    expect(parts.map((part) => part.kind)).toEqual(["ts", "pid", "tag", "app", "level", "msg"]);
    expect(parts.find((part) => part.kind === "pid")?.text).toBe("  100-200   ");
    expect(parts.find((part) => part.kind === "app")?.text.length).toBe(36);
    expect(formatMessage(line(), shown).text).not.toBe(formatLogLine(line()));
  });

  it("清单时间按 timeFormat 投影", () => {
    const clock = { ...shown, timeFormat: "time_millis" as const };
    expect(formatParts(formatMessage(line(), clock)).find((part) => part.kind === "ts")?.text).toBe("12:00:00.000 ");
    expect(formatColumns(clock).find((col) => col.key === "ts")?.width).toBe(13);
    expect(headerWidth(clock)).toBe(13 + 12 + 24 + 36 + 4);
  });

  it("Tag 最大宽对照官方 TagFormat.maxLength，不经 store 列宽", () => {
    expect(shown.tagWidthPx).toBe(TAG_DEFAULT_WIDTH_PX);
    expect(tagMaxLength(shown)).toBe(TAG_DEFAULT_MAX);
  });

  it("PID+TID 合成 BOTH，文档没有单独 TID 段", () => {
    const parts = formatParts(formatMessage(line(), all));
    expect(parts.find((part) => part.kind === "tid")).toBeUndefined();
    expect(parts.find((part) => part.kind === "pid")?.text).toBe("  100-200   ");
    expect(formatColumns(all).map((col) => col.key)).toEqual(["ts", "uid", "pid", "tag", "app", "level", "msg"]);
  });

  it("标题栏与内容同序同宽，PID+TID 按内容拆成两段", () => {
    expect(logFieldLabel("ts")).toBe("时间");
    expect(logFieldLabel("msg")).toBe("消息");
    const head = headerColumns(shown);
    expect(head.map((col) => col.key)).toEqual(["ts", "pid", "tid", "tag", "app", "level", "msg"]);
    expect(head.map((col) => col.label)).toEqual(["时间", "PID", "TID", "Tag", "应用", "级别", "消息"]);
    expect(head.filter((col) => col.key !== "msg").reduce((n, col) => n + (col.width ?? 0), 0)).toBe(
      headerWidth(shown),
    );
    expect(head.find((col) => col.key === "level")?.resizable).toBe(false);
    expect(head.find((col) => col.key === "msg")?.resizable).toBe(false);
    expect(head.find((col) => col.key === "tag")?.resizable).toBe(true);
    expect(logDocTrackTemplate(shown, 8)).toBe("192px 48px 48px 192px 288px 32px max-content");
    expect(logDocTrackTemplate({ ...shown, softWrap: true }, 8)).toContain("minmax(0, 1fr)");
    const allHead = headerColumns(all);
    expect(allHead.map((col) => col.key)).toEqual(["ts", "uid", "pid", "tid", "tag", "app", "level", "msg"]);
    expect(allHead.find((col) => col.key === "uid")?.label).toBe("UID");
    const pidOnly = headerColumns(
      defaultFormatOptions({
        ...DEFAULT_LOG_DISPLAY_COLUMNS,
        tid: false,
      }),
    );
    expect(pidOnly.map((col) => col.key)).toEqual(["ts", "pid", "tag", "app", "level", "msg"]);
    expect(pidOnly.some((col) => col.key === "tid")).toBe(false);
  });

  it("拖宽按 ch 加宽文档，PID/TID 各自垫进 BOTH 段", () => {
    const wide = { ...shown, colChars: { pid: 8, tid: 7, tag: 30 } };
    expect(headerWidth(wide)).toBe(24 + 8 + 7 + 30 + 36 + 4);
    expect(formatProcessThread(line(), "both", 8, 7)).toBe("  100-  200    ");
    expect(formatProcessThread(line(), "both", 8, 7).length).toBe(15);
    expect(formatParts(formatMessage(line(), wide)).find((part) => part.kind === "pid")?.text.length).toBe(15);
    expect(formatParts(formatMessage(line(), wide)).find((part) => part.kind === "tag")?.text.length).toBe(30);
    expect(logDocTrackTemplate(wide, 8)).toBe("192px 64px 56px 240px 288px 32px max-content");
  });
});

describe("着色 range", () => {
  it("目录每项都有引擎，未知 id 回落默认", () => {
    for (const item of LOG_COLOR_SCHEME_CATALOG) {
      expect(contentColor(item.value).id).toBe(item.value);
    }
    expect(contentColor("darcula").id).toBe(LOG_COLOR_SCHEME_DEFAULT);
  });

  it("Yohu：已知级别都是 wash/line 色块，对照 LevelFormat BACKGROUND；尾空格不着色", () => {
    const debug = formatMessage(line({ level: "D" }), shown);
    expect(debug.bar).toBe("level");
    const d = debug.ranges.find((range) => range.kind === "level" && range.tone);
    expect(d?.tone).toBe("wash");
    expect(d?.box).toBe("line");
    expect(d?.style).toEqual({
      "--yohu-log-level-fg": "var(--yohu-fg-on)",
      "--yohu-log-level-bg": "var(--yohu-level-d)",
    });
    const dTrail = debug.ranges.filter((range) => range.kind === "level");
    expect(dTrail[1]?.tone).toBeUndefined();
    const info = formatMessage(line({ level: "I" }), shown);
    const i = info.ranges.find((range) => range.kind === "level" && range.tone);
    expect(i?.tone).toBe("wash");
    expect(i?.style).toEqual({
      "--yohu-log-level-fg": "var(--yohu-fg-on)",
      "--yohu-log-level-bg": "var(--yohu-level-i)",
    });
    const fatal = formatMessage(line({ level: "F" }), shown);
    const f = fatal.ranges.find((range) => range.kind === "level" && range.tone);
    expect(f?.tone).toBe("wash");
    expect(f?.box).toBe("line");
    expect(f?.style).toEqual({
      "--yohu-log-level-fg": "var(--yohu-fg-on)",
      "--yohu-log-level-bg": "var(--yohu-level-f)",
    });
  });

  it("Logcat：级别字母是 wash/line 色块，不是 ink", () => {
    const painted = formatMessage(line({ level: "D" }), { ...shown, scheme: "logcat" });
    const d = painted.ranges.find((range) => range.kind === "level" && range.tone);
    expect(d?.tone).toBe("wash");
    expect(d?.box).toBe("line");
  });

  it("Logcat 分 token，无左条；时间/进程无色键", () => {
    const painted = formatMessage(line({ level: "I" }), { ...all, scheme: "logcat" });
    expect(painted.bar).toBe("none");
    expect(painted.ranges.find((range) => range.kind === "pid")?.tone).toBeUndefined();
    expect(painted.ranges.find((range) => range.kind === "tag")?.style).toEqual({
      "--yohu-log-ink": `var(--yohu-logcat-tag-${tagSwatchIndex("Yohu")})`,
    });
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
    expect(src).not.toContain("./board");
    expect(src).not.toContain("./view");
    expect(src).not.toContain("./markup-model");
    expect(src).not.toContain("./markup-policy");
    expect(src).not.toContain("./markup-registry");
    expect(src).not.toContain("./selection");
    expect(src).not.toContain("../highlight");
    expect(src).not.toContain("../layout");
  });
});
