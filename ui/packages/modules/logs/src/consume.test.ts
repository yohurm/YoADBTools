import { describe, expect, it } from "vitest";

import type { LogLine } from "@yohu/api";
import { rebindPids as apiRebindPids, scanSignal as apiScanSignal } from "@yohu/api";

import { emptyBinding, pidSetOf, rebindPids } from "./binding";
import {
  LEVELS,
  joinTagInput,
  levelKey,
  levelLabel,
  matchesLine,
  normalizeLevels,
  parseTagNeedles,
  removeTagNeedle,
  splitTagInput,
  tagFilterActive,
  toggleLevel,
  toWireFilter,
  type SessionFilter,
} from "./filter";
import { RingMirror } from "./mirror";
import { scanSignal } from "./signals";
import { collapseStack } from "./stack";

const line = (over: Partial<LogLine>): LogLine => ({
  seq: 0,
  ts: "2026-01-01 00:00:00.000",
  pid: 100,
  tid: 1,
  level: "I",
  tag: "T",
  msg: "m",
  ...over,
});

const filter = (over: Partial<SessionFilter>): SessionFilter => ({
  levels: [],
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
  ...over,
});

describe("levelKey（筛选钮键，与 --yohu-level-* 对齐）", () => {
  it("已知级别映射到 token 小写键", () => {
    expect(levelKey("V")).toBe("v");
    expect(levelKey("e")).toBe("e");
    expect(levelKey("F")).toBe("f");
  });

  it("未知级别不着色", () => {
    expect(levelKey("?")).toBeNull();
    expect(levelKey("")).toBeNull();
    expect(levelKey("X")).toBeNull();
  });
});

describe("LEVELS 铬", () => {
  it("字母说明文案跟 LEVELS 对齐", () => {
    expect(LEVELS.map(levelLabel)).toEqual(["Verbose", "Debug", "Info", "Warn", "Error", "Fatal"]);
  });
});

describe("normalizeLevels / toggleLevel", () => {
  it("只收 LEVELS 字母，按 V→F 去重排序", () => {
    expect(normalizeLevels(["e", "W", "W", "X", "?"])).toEqual(["W", "E"]);
    expect(normalizeLevels([])).toEqual([]);
  });

  it("独立切换：按下只加入自己，再按弹起", () => {
    expect(toggleLevel([], "W")).toEqual(["W"]);
    expect(toggleLevel(["W"], "E")).toEqual(["W", "E"]);
    expect(toggleLevel(["W", "E"], "W")).toEqual(["E"]);
    expect(toggleLevel(["E"], "E")).toEqual([]);
  });
});

describe("matchesLine", () => {
  it("级别精确集合：选 W 不含 E/I", () => {
    const f = filter({ levels: ["W"] });
    expect(matchesLine(line({ level: "W" }), f)).toBe(true);
    expect(matchesLine(line({ level: "E" }), f)).toBe(false);
    expect(matchesLine(line({ level: "I" }), f)).toBe(false);
  });

  it("级别可多选：W+E 不含 I", () => {
    const f = filter({ levels: ["W", "E"] });
    expect(matchesLine(line({ level: "W" }), f)).toBe(true);
    expect(matchesLine(line({ level: "E" }), f)).toBe(true);
    expect(matchesLine(line({ level: "I" }), f)).toBe(false);
  });

  it("空集合不限级别，含解析失败", () => {
    expect(matchesLine(line({ level: "?" }), filter({ levels: [] }))).toBe(true);
    expect(matchesLine(line({ level: "?" }), filter({ levels: ["V"] }))).toBe(false);
  });

  it("Tag 打字前缀匹配与已提交气泡精确匹配（忽略大小写）", () => {
    expect(matchesLine(line({ tag: "OkHttp" }), filter({ tagContains: "okhttp" }))).toBe(true);
    expect(matchesLine(line({ tag: "GGEC-DeviceEventRouter" }), filter({ tagContains: "GGEC-" }))).toBe(true);
    expect(matchesLine(line({ tag: "GGEC-DeviceEventRouter" }), filter({ tagContains: "GGEC-," }))).toBe(false);
    expect(matchesLine(line({ tag: "libcomposer_ext" }), filter({ tagContains: "libc," }))).toBe(false);
    expect(matchesLine(line({ tag: "libc" }), filter({ tagContains: "libc," }))).toBe(true);
    expect(matchesLine(line({ msg: "Request Timeout" }), filter({ keyword: "timeout" }))).toBe(true);
    expect(matchesLine(line({ msg: "ok" }), filter({ keyword: "timeout" }))).toBe(false);
  });

  it("Tag 多针逗号分隔，任一精确命中", () => {
    const f = filter({ tagContains: "HfLooper, adbd" });
    expect(matchesLine(line({ tag: "HfLooper" }), f)).toBe(true);
    expect(matchesLine(line({ tag: "adbd" }), f)).toBe(true);
    expect(matchesLine(line({ tag: "Other" }), f)).toBe(false);
  });

  it("Tag 针内空白保留，仅分隔符等于不限", () => {
    expect(matchesLine(line({ tag: "wdt_dump_cntcv CPU" }), filter({ tagContains: "wdt_dump_cntcv CPU, x" }))).toBe(
      true,
    );
    expect(matchesLine(line({ tag: "Other" }), filter({ tagContains: " , ， " }))).toBe(true);
  });

  it("Scope=Pid 精确相等", () => {
    const f = filter({ scope: { kind: "pid", pid: 42 } });
    expect(matchesLine(line({ pid: 42 }), f)).toBe(true);
    expect(matchesLine(line({ pid: 43 }), f)).toBe(false);
  });

  it("Scope=Package 用 pidSet", () => {
    const f = filter({ scope: { kind: "package", pkg: "com.foo", includeChild: false }, pidSet: [1, 2] });
    expect(matchesLine(line({ pid: 2 }), f)).toBe(true);
    expect(matchesLine(line({ pid: 3 }), f)).toBe(false);
  });
});

describe("parseTagNeedles", () => {
  it("逗号 / 分号 / 竖线拆针，去空段，空白留在针内", () => {
    expect(parseTagNeedles("")).toEqual([]);
    expect(parseTagNeedles("  ")).toEqual([]);
    expect(parseTagNeedles("okhttp")).toEqual(["okhttp"]);
    expect(parseTagNeedles("hfl, adbd")).toEqual(["hfl", "adbd"]);
    expect(parseTagNeedles("hfl，adbd、binder")).toEqual(["hfl", "adbd", "binder"]);
    expect(parseTagNeedles("hfl; adbd|binder")).toEqual(["hfl", "adbd", "binder"]);
    expect(parseTagNeedles("okhttp,")).toEqual(["okhttp"]);
    expect(parseTagNeedles("wdt_dump_cntcv CPU, HfLooper")).toEqual(["wdt_dump_cntcv CPU", "HfLooper"]);
    expect(tagFilterActive(" , ")).toBe(false);
    expect(tagFilterActive("okhttp,")).toBe(true);
  });

  it("逗号提交成气泡；草稿与已提交可还原", () => {
    expect(splitTagInput("libc")).toEqual({ committed: [], draft: "libc" });
    expect(splitTagInput("libc,")).toEqual({ committed: ["libc"], draft: "" });
    expect(splitTagInput("libc, adbd")).toEqual({ committed: ["libc"], draft: "adbd" });
    expect(splitTagInput("libc, adbd,")).toEqual({ committed: ["libc", "adbd"], draft: "" });
    expect(joinTagInput(["libc", "Libc"], "")).toBe("libc, ");
    expect(joinTagInput(["libc"], "adbd")).toBe("libc, adbd");
    expect(removeTagNeedle("libc, adbd,", "libc")).toBe("adbd, ");
  });
});

describe("PidBinding 包名重绑（含历史集）", () => {
  it("模块转发 @yohu/api", () => {
    expect(rebindPids).toBe(apiRebindPids);
    expect(pidSetOf(emptyBinding())).toEqual([]);
  });

  it("toWireFilter：空 package pids 与 pid 作用域", () => {
    expect(
      toWireFilter({
        levels: ["W"],
        tagContains: "",
        keyword: "",
        scope: { kind: "package", pkg: "com.none", includeChild: false },
        binding: emptyBinding(),
      }),
    ).toEqual({
      levels: ["W"],
      tag_contains: undefined,
      message_contains: undefined,
      scope: { kind: "package", pids: [] },
    });
    expect(
      toWireFilter({
        levels: [],
        tagContains: "",
        keyword: "",
        scope: { kind: "pid", pid: 42 },
        binding: emptyBinding(),
      }).scope,
    ).toEqual({ kind: "pid", pid: 42 });
    expect(
      toWireFilter({
        levels: [],
        tagContains: " , ， ",
        keyword: "",
        scope: { kind: "all" },
        binding: emptyBinding(),
      }).tag_contains,
    ).toBeUndefined();
    expect(
      toWireFilter({
        levels: [],
        tagContains: "hfl, adbd",
        keyword: "",
        scope: { kind: "all" },
        binding: emptyBinding(),
      }).tag_contains,
    ).toBe("hfl, adbd");
  });
});

describe("scanSignal", () => {
  it("模块转发 @yohu/api", () => {
    expect(scanSignal).toBe(apiScanSignal);
  });
});

describe("collapseStack", () => {
  it("连续堆栈帧折叠为首帧+计数", () => {
    const lines = [
      line({ msg: "Exception" }),
      line({ msg: "at a()" }),
      line({ msg: "at b()" }),
      line({ msg: "at c()" }),
      line({ msg: "next" }),
      line({ msg: "at d()" }),
    ];
    const rows = collapseStack(lines);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ collapsedAfter: 2 });
    expect(rows[2]!.line.msg).toBe("next");
  });

  it("逐行标记信号（崩溃/ANR → signal 字段，供行级底色与 Error 左条）", () => {
    const rows = collapseStack([
      line({ msg: "normal" }),
      line({ tag: "AndroidRuntime", msg: "FATAL EXCEPTION: main" }),
      line({ msg: "ANR in com.foo" }),
    ]);
    expect(rows[0]!.signal).toBeUndefined();
    expect(rows[1]!.signal).toBe("crash");
    expect(rows[2]!.signal).toBe("anr");
  });
});

describe("RingMirror 共享缓冲镜像", () => {
  it("seq 去重与容量环形", () => {
    const m = new RingMirror(3);
    expect(
      m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 0 }), line({ seq: 1 })] }),
    ).toBe(2);
    // 重复重放去重
    expect(
      m.pushBatch({ serial: "s", from_seq: 1, truncated: false, lines: [line({ seq: 1 }), line({ seq: 2 })] }),
    ).toBe(1);
    expect(m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 3 }), line({ seq: 4 })] })).toBe(2);
    expect(m.size()).toBe(3);
    expect(m.lastSeqNumber()).toBe(4);
  });

  it("过滤重放取尾部 limit 条", () => {
    const m = new RingMirror(10);
    m.pushBatch({
      serial: "s",
      from_seq: 0,
      truncated: false,
      lines: [0, 1, 2, 3, 4].map((seq) => line({ seq, level: seq % 2 === 0 ? "E" : "I" })),
    });
    const out = m.replay((l) => l.level === "E", 2);
    expect(out.map((l) => l.seq)).toEqual([2, 4]);
  });

  it("clear 丢行但 lastSeq 不回退，拒绝过期批次", () => {
    const m = new RingMirror(10);
    m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 9 })] });
    m.clear();
    expect(m.size()).toBe(0);
    expect(m.lastSeqNumber()).toBe(9);
    expect(m.pushBatch({ serial: "s", from_seq: 0, truncated: false, lines: [line({ seq: 0 })] })).toBe(0);
    expect(m.pushBatch({ serial: "s", from_seq: 10, truncated: false, lines: [line({ seq: 10 })] })).toBe(1);
  });

  it("setCapacity 裁剪过长缓冲", () => {
    const m = new RingMirror(10);
    m.pushBatch({
      serial: "s",
      from_seq: 0,
      truncated: false,
      lines: [0, 1, 2, 3, 4].map((seq) => line({ seq })),
    });
    m.setCapacity(2);
    expect(m.size()).toBe(2);
    expect(m.replay(() => true, 10).map((l) => l.seq)).toEqual([3, 4]);
  });
});
