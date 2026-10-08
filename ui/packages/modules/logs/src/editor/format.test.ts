import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { formatLogLine, LOG_COLOR_SCHEME_CATALOG, LOG_COLOR_SCHEME_DEFAULT, type LogLine } from "@yohu/api";

import {
  ALL_LOG_DISPLAY_COLUMNS,
  DEFAULT_CH_PX,
  DEFAULT_LOG_DISPLAY_COLUMNS,
  TAG_DEFAULT_MAX,
  TAG_DEFAULT_WIDTH_PX,
  appNameOf,
  contentColor,
  defaultFormatOptions,
  formatAppName,
  formatColumns,
  formatMessage,
  formatMessages,
  formatOptionsKey,
  logcatLevelLetter,
  formatParts,
  formatProcessThread,
  formatTag,
  formatTimestamp,
  formatUid,
  headerColumns,
  headerWidth,
  javaStringHash,
  LEVEL_FORMAT_WIDTH,
  logChUnit,
  logColPx,
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

  it("hideDuplicates 时连续相同 Tag/App 留空列（AS TagFormat / AppNameFormat）", () => {
    const dup = { ...shown, hideDuplicateTag: true, hideDuplicateApp: true };
    const a = line({ tag: "Same", pid: 9 });
    const b = line({ tag: "Same", pid: 9, msg: "b" });
    const { messages } = formatMessages([a, b], dup);
    expect(formatParts(messages[0]!).find((p) => p.kind === "tag")?.text.trim()).toBe("Same");
    expect(formatParts(messages[1]!).find((p) => p.kind === "tag")?.text.trim()).toBe("");
    expect(formatParts(messages[1]!).find((p) => p.kind === "app")?.text.trim()).toBe("");
  });

  it("FATAL 级别列显示 A（AS LogLevel.ASSERT）", () => {
    expect(logcatLevelLetter("F")).toBe("A");
    const fatal = formatMessage(line({ level: "F" }), shown);
    expect(fatal.text).toContain(" A ");
    expect(fatal.text).not.toContain(" F ");
  });

  it("TagFormat padEnd(max+1)，空 Tag 是 <no-tag>（对照 AS TagFormat）", () => {
    expect(formatTag("Yohu", 23)).toBe("Yohu".padEnd(24));
    expect(formatTag("", 23)).toBe("<no-tag>".padEnd(24));
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

  it("级别色键走 api levelKey，Formatter 不再自折字母", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    expect(src).toContain("levelKey");
    expect(src).not.toContain("function levelSwatch");
    expect(src).not.toContain("parseLevelLetter");
    expect(src).not.toContain('from "../filter"');
    expect(src).not.toContain('from "./filter"');
    const body = src
      .replace('return kind === "msg"', "")
      .replace('return kind === "level"', "")
      .replace('return kind === "ts" || kind === "uid"', "")
      .replace('return kind === "pid" || kind === "tid" || kind === "app"', "")
      .replace('return level === "F"', "")
      .replace('|| level === "A"', "");
    expect(body).not.toContain('kind === "msg"');
    expect(body).not.toContain('kind === "level"');
    expect(body).not.toContain('kind === "ts"');
    expect(body).not.toContain('kind === "uid"');
    expect(body).not.toContain('kind === "pid"');
    expect(body).not.toContain('kind === "tid"');
    expect(body).not.toContain('kind === "app"');
    expect(body).not.toContain('key === "msg"');
    expect(body).not.toContain('key !== "msg"');
    expect(body).not.toContain('key === "level"');
    expect(body).not.toContain('key !== "level"');
    const header = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../LogColumnHeader.tsx"), "utf8");
    expect(header).toContain("logFieldIsMessage");
    expect(header).not.toContain('"msg"');
    expect(body).not.toContain('level === "F"');
    expect(body).not.toContain('level === "A"');
    const thread = src
      .replace('return style === "both"', "")
      .replace('return style === "pid"', "")
      .replace('return style === "tid"', "")
      .replace('return style === "off"', "");
    expect(thread).not.toContain('style === "both"');
    expect(thread).not.toContain('style === "pid"');
    expect(thread).not.toContain('style === "tid"');
    expect(thread).not.toContain('process === "both"');
    expect(thread).not.toContain('process === "tid"');
    expect(thread).not.toContain('process !== "off"');
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

describe("列键和探针尺只写一处", () => {
  it("进程列键、ch 回落和列像素不再各写一遍", () => {
    expect(logChUnit(0)).toBe(DEFAULT_CH_PX);
    expect(logChUnit(8)).toBe(8);
    expect(logColPx(24, 8)).toBe(192);
    const root = dirname(fileURLToPath(import.meta.url));
    const format = readFileSync(resolve(root, "format.ts"), "utf8")
      .replace('return processThreadIsTid(style) ? "tid" : "pid";', "")
      .replace("return chPx > 0 ? chPx : DEFAULT_CH_PX;", "")
      .replace("return Math.max(1, Math.round(chars * logChUnit(chPx)));", "");
    expect(format).not.toContain('? "tid" : "pid"');
    expect(format.split('col.key === "pid"').length - 1).toBe(1);
    expect(format).not.toContain("chPx > 0");
    expect(format).not.toContain("Math.max(1, Math.round");
    const header = readFileSync(resolve(root, "../LogColumnHeader.tsx"), "utf8");
    expect(header).toContain("logColPx");
    expect(header).toContain("logChUnit");
    expect(header).not.toContain("chPx > 0");
    expect(header).not.toContain("Math.max(1, Math.round");
    expect(header).not.toContain("DEFAULT_CH_PX");
    const layout = readFileSync(resolve(root, "../layout.ts"), "utf8");
    expect(layout).toContain("logChUnit");
    expect(layout).not.toContain("DEFAULT_CH_PX");
    expect(layout).not.toContain("width > 0");
  });
});

describe("末尾补齐只写一处", () => {
  it("pad_end_num_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "text.pad" + "End(width)";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("padField(");
  });

  it("pad_end_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = ".pad" + "End(";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("padField(");
  });
});

describe("进程号列宽只写一处", () => {
  it("process_col_chars_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = ", PROCESS_PID" + "_WIDTH)";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("processColChars(");
  });
});

describe("时间用户应用列宽只写一处", () => {
  it("meta_col_chars_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const ts = 'colCharsOf(options, "' + 'ts"';
    const uid = 'colCharsOf(options, "' + 'uid"';
    const app = 'colCharsOf(options, "' + 'app"';
    const once = "colCharsOf(options, key, " + "fallback)";
    expect(src.split(ts).length - 1).toBe(0);
    expect(src.split(uid).length - 1).toBe(0);
    expect(src.split(app).length - 1).toBe(0);
    expect(src.split(once).length - 1).toBe(1);
    expect(src).toContain("metaColChars(");
  });
});

describe("可拖宽表头只写一处", () => {
  it("resizable_header_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "resizable: " + "true";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("resizableHeader(");
  });
});

describe("消息按列清单走一遍", () => {
  it("message_walks_columns_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    expect(src.split("if (display." + "ts)").length - 1).toBe(1);
    expect(src.split("if (display." + "uid)").length - 1).toBe(1);
    expect(src.split("if (display." + "tag)").length - 1).toBe(1);
    expect(src.split("if (display." + "app)").length - 1).toBe(1);
    expect(src.split("if (display." + "level)").length - 1).toBe(1);
    expect(src.split("if (!processThreadIsOff(" + "process))").length - 1).toBe(1);
    expect(src).toContain("formatColumns(");
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

describe("累加器打包只写一处", () => {
  it("pack_message_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const bar = "bar: " + "engine.bar";
    const ink = "engine.barInk(" + "line)";
    expect(src.split(bar).length - 1).toBe(1);
    expect(src.split(ink).length - 1).toBe(1);
    expect(src).toContain("packMessage(");
  });
});

describe("标签和应用名显示宽度只写一处", () => {
  it("span_width_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const tag = "Math.max(TAG_MIN_LENGTH, " + "maxLength) + 1";
    const app = "Math.max(APP_MIN_LENGTH, " + "maxLength) + 1";
    const once = "Math.max(min, " + "maxLength) + 1";
    expect(src.split(tag).length - 1).toBe(0);
    expect(src.split(app).length - 1).toBe(0);
    expect(src.split(once).length - 1).toBe(1);
    expect(src).toContain("spanWidth(");
  });
});

describe("缩短之后再补一个空格只写一处", () => {
  it("ellipsis_span_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = '`${shorten' + 'TextWithEllipsis(';
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("ellipsisSpan(");
  });
});

describe("没有级别键时回落正文色只写一处", () => {
  it("level_ink_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "return plain" + "MessageInk(kind)";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("levelInk(");
  });
});

describe("Yohu 级别色变量只写一处", () => {
  it("yohu_level_var_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "--yohu-level-${" + "key})";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("yohuLevelVar(");
  });
});

describe("Logcat 级别色变量只写一处", () => {
  it("logcat_level_var_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    expect(src.split("--yohu-logcat-level-${" + "key})").length - 1).toBe(0);
    expect(src.split("--yohu-logcat-level-${" + "key}-bg").length - 1).toBe(0);
    expect(src.split("--yohu-logcat-level-${" + "key}").length - 1).toBe(1);
    expect(src).toContain("logcatLevelVar(");
  });
});

describe("可选布尔缺省关只写一处", () => {
  it("flag_on_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "?" + "? false";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("flagOn(");
  });
});

describe("布尔收成 0 或 1 只写一处", () => {
  it("bit_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = "Number" + "(";
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("return " + needle + "value)");
  });
});

describe("批次游标只写一处", () => {
  it("batch_cursor_once", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const format = readFileSync(resolve(dir, "format.ts"), "utf8");
    const document = readFileSync(resolve(dir, "document.ts"), "utf8");
    expect(format.split("previousTag: " + "line.tag").length - 1).toBe(1);
    expect(document.split("previousTag: " + "last.tag").length - 1).toBe(0);
    expect(format).toContain("batchCursor(");
    expect(document).toContain("batchCursor(");
  });
});

describe("空白字段只补一次", () => {
  it("blank_field_once", () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "format.ts"), "utf8");
    const needle = 'padField("' + '", width)';
    expect(src.split(needle).length - 1).toBe(1);
    expect(src).toContain("blankField(");
  });
});
