import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Density, setColWidth } from "@yohu/ui";
import { defaultFormatOptions, trackTemplate } from "./editor";
import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  LOG_COLUMNS,
  LOG_FIELD_CHARS,
  LOG_LEVEL_TRACK_CHARS,
  dataRowHeight,
  defaultLogColWidths,
  headerLabelChars,
  logColResizable,
  logFieldText,
  logSlotChars,
  visibleLogColumns,
} from "./layout";

function loadSrc(name: string): string {
  const candidates = [
    resolve(process.cwd(), `src/${name}`),
    resolve(process.cwd(), `packages/modules/logs/src/${name}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const logsCss = loadSrc("logs.css");

describe("日志表头布局契约", () => {
  it("表头钉在虚拟列表外，不随行滚动", () => {
    expect(logsCss).toMatch(/\.yohu-logs__list\s*\{[^}]*display:\s*flex/);
    expect(logsCss).toMatch(/\.yohu-logs__cols--head\s*\{[^}]*flex-shrink:\s*0/);
    expect(logsCss).toContain("var(--yohu-row-height-header)");
    expect(logsCss).toMatch(/\.yohu-logs__list-body\s*\{[^}]*overflow:\s*hidden/);
    expect(logsCss).toMatch(/\.yohu-logs__status\s*\{[^}]*flex-shrink:\s*0/);
    expect(logsCss).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    expect(logsCss).not.toMatch(/overflow:\s*(auto|scroll)/);
  });

  it("列轨道不在模块 CSS 写死，交给 YoColFrame", () => {
    expect(logsCss).not.toMatch(/\.yohu-logs__cols\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*user-select:\s*text/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*white-space:\s*pre/);
    expect(logsCss).toMatch(/\[data-log-pad\]\s*\{[^}]*user-select:\s*none/);
    expect(logsCss).not.toContain("::highlight(yohu-log-sel)");
    expect(logsCss).not.toContain("yohu-logs__sel-layer");
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s+\.yohu-col-cell/);
    expect(logsCss).toContain("var(--yohu-text-sel)");
    expect(logsCss).toContain("var(--yohu-text-sel-fg)");
    expect(logsCss).toMatch(
      /\.yohu-logs__list ::selection\s*\{\s*background-color:\s*var\(--yohu-text-sel\);\s*color:\s*var\(--yohu-text-sel-fg\)/,
    );
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
    expect(dialog).toContain("YoVirtualList");
    expect(dialog).not.toMatch(/<YoScroller[\s>/]/);
    expect(dialog).toContain("YoEmptyState");
    expect(dialog).toContain("YoLoading");
    expect(dialog).toContain("block");
    expect(dialog).toContain("yohu-logs__new-bar");
    expect(dialog).toContain("devicePickerFields");
    expect(dialog).toContain('flex="fill"');
    expect(dialog).not.toContain("<YoIndicator");
    expect(dialog).not.toContain('tone="list"');
    expect(dialog).not.toContain("YoFormRow");
    expect(dialog).not.toMatch(/<YoSegmentedButton[\s\S]*?\bblock\b/);
    expect(logsCss).toMatch(/\.yohu-logs__new-list\s*\{[^}]*flex-direction:\s*column/);
    expect(dialog).toContain("onSubmit");
    expect(dialog).toContain("onCreated");
    expect(dialog).not.toContain("yohu-logs__new-empty");
    expect(dialog).not.toContain("yohu-logs__new-hint");
    expect(dialog).not.toContain("yohu-logs__new-error");
    expect(logsCss).not.toContain(".yohu-logs__new-empty");
    expect(logsCss).not.toContain(".yohu-logs__status-signal");
    expect(logsCss).not.toContain(".yohu-logs__status-lag");
    expect(logsCss).not.toContain(".yohu-logs__status-dot");
    expect(logsCss).not.toContain(".yohu-logs__row--raw");
    expect(dialog).not.toContain("__body");
    expect(logsCss).toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*inline/);
    expect(logsCss).not.toMatch(/\.yohu-logs__ch-probe\s*\{[^}]*display:\s*block/);
  });
});

describe("日志显示列", () => {
  it("默认不含 UID/TID，列序时间/PID/Tag/级别/消息", () => {
    expect(trackTemplate(defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS))).toBe(
      "26ch 8ch 26ch 4ch minmax(10ch, 1fr)",
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
    expect(trackTemplate(defaultFormatOptions(display))).toBe("8ch 4ch minmax(10ch, 1fr)");
  });

  it("全部元数据关闭只剩消息", () => {
    const display = { ts: false, uid: false, pid: false, tid: false, level: false, tag: false };
    expect(trackTemplate(defaultFormatOptions(display))).toBe("minmax(10ch, 1fr)");
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
      " I ",
      "hello",
    ]);
  });

  it("表头全角计入其他列；级别只认官方 3ch，轨道 4ch，禁止拖开", () => {
    expect(headerLabelChars("级别")).toBe(4);
    expect(headerLabelChars("时间")).toBe(4);
    expect(headerLabelChars("PID")).toBe(3);
    expect(LOG_FIELD_CHARS.level).toBe(3);
    expect(LOG_LEVEL_TRACK_CHARS).toBe(4);
    expect(logSlotChars("level", "级别")).toBe(3);
    expect(logSlotChars("pid", "PID")).toBe(5);
    expect(logSlotChars("ts", "时间", "time_millis")).toBe(12);
    expect(LOG_COLUMNS.find((col) => col.key === "level")?.minWidth).toBe(32);
    expect(LOG_COLUMNS.find((col) => col.key === "level")?.resize).toBe(false);
    expect(logColResizable(LOG_COLUMNS.find((col) => col.key === "level")!)).toBe(false);
    expect(logColResizable(LOG_COLUMNS.find((col) => col.key === "tag")!)).toBe(true);
    expect(dataRowHeight()).toBe(Density.Comfortable.rowHeight);
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
    const load = (name: string): string => {
      const candidates = [
        resolve(process.cwd(), `src/${name}`),
        resolve(process.cwd(), `packages/modules/logs/src/${name}`),
      ];
      return candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ?? "";
    };
    const view = load("LogAnalyzerView.tsx");
    expect(view).not.toContain("data-scheme");
    expect(view).not.toContain("logcat.css");
    const filter = load("LogFilterBar.tsx");
    const editorView = load("editor/view.tsx");
    const formatter = load("editor/format.ts");
    expect(view).toContain('overflow="hidden"');
    expect(view).toContain('variant="pane"');
    expect(view).toContain("YoScroller");
    expect(view).toContain('title="重命名会话"');
    expect(view.slice(view.indexOf('title="重命名会话"'))).toMatch(
      /<YoScroller>\s*<YoTextField/,
    );
    expect(view).not.toMatch(/<YoScroller[\s\S]*?<YoVirtualList/);
    expect(view).toContain("visibleLogColumns(displayColumns())");
    expect(view).toContain("logColResizable(col)");
    expect(view).toContain('pad={col.key === "level" ? "none" : undefined}');
    expect(logsCss).not.toContain("yohu-logs__head-level");
    expect(filter).toContain("YoListPresence");
    expect(filter).toContain('recipe="chip"');
    expect(filter).toContain("YoChip");
    expect(filter).toContain("YoTextField");
    expect(filter).toContain("YoSearch");
    expect(filter).not.toMatch(/<(input|select|textarea)\b/);
    expect(filter).not.toContain("__body");
    expect(editorView).not.toMatch(/<(input|select|textarea|button)\b/);
    expect(editorView).not.toContain("__body");
    expect(editorView).not.toContain("yohu-logs__row--raw");
    expect(editorView).not.toContain("data-tint-msg");
    expect(editorView).not.toContain("tintMessage");
    expect(editorView).not.toContain("paintLogLine");
    expect(editorView).not.toContain("formatMessage");
    expect(editorView).toContain("data-tone");
    expect(editorView).toContain("data-bar");
    expect(editorView).not.toContain("badge");
    expect(editorView).not.toContain("splitLevelGlyph");
    expect(editorView).not.toContain("level-paint");
    expect(editorView).not.toContain("data-paint");
    expect(view).not.toContain("contentColor");
    expect(formatter).toContain("parseLevelLetter");
    expect(formatter).not.toContain("../filter");
    expect(view).not.toContain("__body");
    expect(filter).toContain("YoSegmentedButton");
    expect(filter).toContain('type="capsule"');
    expect(filter).toContain("multiple");
    expect(filter).toContain("fill:");
    expect(filter).toContain("ink:");
    expect(filter).toContain("--yohu-level-");
    expect(filter).not.toContain("yohu-ink");
    expect(filter).not.toContain("levelInkStyle");
    expect(filter).not.toContain("YoButton");
    expect(filter).not.toContain("data-paint");
    expect(filter).not.toContain("data-level");
    expect(view).not.toContain("logDocColumns");
    expect(view).not.toContain("logDocTrackPx");
    expect(view).toContain("action=");
    expect(view).toContain("text={`信号 ${session.signalCount}`}");
    expect(view).toContain("width={logStore.state.colWidths[col.key]}");
    expect(view).toContain("align={col.align}");
    expect(view).toContain("EditorView");
    expect(view).not.toContain("expandLogVisual");
    expect(view).not.toContain("LogListProjector");
    expect(view).not.toContain("YoVirtualList");
    expect(editorView).toContain("YoVirtualList");
    expect(editorView).toContain("itemHeight={props.itemHeight}");
    expect(view).toContain("itemHeight={dataRowHeight()}");
    expect(view).not.toContain("hangChars");
    expect(editorView).toContain("wrapBody");
    expect(load("doc.ts")).toBe("");
    expect(load("wrap.ts")).toBe("");
    expect(load("list-project.ts")).toBe("");
    expect(load("LogList.tsx")).toBe("");
    expect(load("LogDocView.tsx")).toBe("");
    expect(load("level-paint.ts")).toBe("");
    expect(load("tag-color.ts")).toBe("");
    expect(load("color/index.ts")).toBe("");
    expect(load("color/yohu.ts")).toBe("");
    expect(load("color/logcat.ts")).toBe("");
    expect(logsCss).toContain("[data-wrap]");
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*pre-wrap/);
    expect(view).toContain("onCreated={beginCapture}");
    expect(view).toContain("onCleanup(() => toaster.destroy())");
    expect(view).not.toContain("Toast.success");
  });

  it("重命名窗 open 独立于载荷，出场后再清 target", () => {
    const load = (name: string): string => {
      const candidates = [
        resolve(process.cwd(), `src/${name}`),
        resolve(process.cwd(), `packages/modules/logs/src/${name}`),
      ];
      return candidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ?? "";
    };
    const view = load("LogAnalyzerView.tsx");
    expect(view).not.toContain("data-scheme");
    expect(view).not.toContain("logcat.css");
    expect(view).toContain("renameOpen");
    expect(view).toContain("onExitComplete");
    expect(view).toContain("open={renameOpen}");
    expect(view).not.toContain("open={() => renameTarget() !== null}");
    expect(view).not.toContain("onClose={() => setRenameTarget(null)}");
    const confirm = view.slice(view.indexOf("logStore.renameSession"), view.indexOf("确定"));
    expect(confirm).toContain("setRenameOpen(false)");
    expect(confirm).not.toContain("setRenameTarget(null)");
  });
});

describe("日志级别色单源", () => {
  it("行 --yohu-log-ink 由 Document range / barInk 写入，CSS 不再列 V–F 映射", () => {
    expect(logsCss).toContain('--yohu-log-ink: var(--yohu-fg-3)');
    expect(logsCss).not.toMatch(/\[data-level="[vdiwe]"\]/);
    expect(logsCss).not.toContain("--yohu-level-f-bg");
    expect(logsCss).not.toContain('[data-paint="invert"]');
    expect(logsCss).not.toContain("padding-inline: 0.5ch");
    expect(logsCss).not.toContain("margin-inline: -0.5ch");
    expect(logsCss).toContain("line-height: var(--yohu-font-leading-data)");
    expect(logsCss).toContain("line-height: var(--yohu-row-height)");
    expect(logsCss).toContain('[data-tone="ink"]');
    expect(logsCss).toContain('[data-tone="wash"]');
    expect(logsCss).toContain('[data-box="line"]');
    expect(logsCss).not.toContain('[data-tone="badge"]');
    expect(logsCss).not.toMatch(/\[data-tone="wash"\][^{]*\{[^}]*border-radius/);
    expect(logsCss).not.toMatch(/\[data-box="line"\][^{]*\{[^}]*border-radius/);
    expect(logsCss).toContain('[data-bar="level"]');
    expect(logsCss).not.toContain(".yohu-logs__row-ts");
    expect(logsCss).not.toContain(".yohu-logs__row-uid");
    expect(logsCss).not.toContain(".yohu-logs__row-pid");
    expect(logsCss).not.toContain("--yohu-log-tag");
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*color:\s*var\(--yohu-fg\)/);
    expect(logsCss).not.toContain("[data-tint-msg]");
    expect(logsCss).toContain("var(--yohu-log-ink)");
    expect(logsCss).not.toMatch(/\.yohu-logs__row-level\s*\{[^}]*text-align:\s*center/);
    expect(logsCss).not.toContain("[data-level] .yohu-logs__row-msg");
    expect(logsCss).not.toContain("data-scheme");
    expect(logsCss).not.toContain("var(--yohu-logcat-msg-");
    expect(loadSrc("color/logcat.css")).toBe("");
    expect(loadSrc("color/index.ts")).toBe("");
    expect(logsCss.includes(`#${"FF6B68"}`)).toBe(false);
    expect(logsCss).not.toContain(".yohu-logs__level--");
    expect(logsCss).not.toContain(".yohu-logs__row--bar-");
    expect(logsCss).toContain(".yohu-logs__levels {");
    expect(logsCss).not.toMatch(/\.yohu-logs__levels\s*\{[^}]*font-size:/);
    expect(logsCss).not.toContain(".yohu-logs__levels-chrome");
    expect(logsCss).not.toContain(".yohu-logs__level-slot");
    expect(logsCss).not.toMatch(/\.yohu-logs__levels\s*\{[^}]*overflow:\s*hidden/);
    expect(logsCss).not.toMatch(/\.yohu-logs__levels\s*\{[^}]*border:/);
    expect(logsCss).not.toContain(".yohu-logs__level-slot:not(:last-child)");
    expect(logsCss).not.toMatch(/\.yohu-logs__new-list\s*\{[^}]*border:/);
    expect(logsCss).not.toContain("color-mix");
    expect(logsCss).not.toContain("--yohu-button-ink");
    expect(logsCss).not.toContain("--yohu-button-fill");
    expect(logsCss).not.toMatch(/z-index:\s*1/);
    expect(logsCss).toContain("z-index: var(--yohu-z-overlay)");
    expect(logsCss).not.toContain(".yohu-button");
    expect(logsCss).not.toContain(".yohu-text-field");
    expect(logsCss).not.toContain("[aria-pressed]");
    expect(logsCss).not.toContain(".yohu-tooltip__anchor");
    expect(logsCss).not.toContain(".yohu-virtual-list");
    expect(logsCss).not.toMatch(/box-shadow:\s*inset 0 calc\(-1 \* var\(--yohu-stroke-accent\)\)/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row-tag\s*\{\s*color:\s*var\(--yohu-accent\)/);
  });
});
