import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Density } from "@yohu/ui";
import {
  ALL_LOG_DISPLAY_COLUMNS,
  DEFAULT_LOG_DISPLAY_COLUMNS,
  defaultFormatOptions,
  formatColumns,
  headerWidth,
} from "./editor";
import { dataRowHeight } from "./layout";

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

describe("日志清单布局契约", () => {
  it("清单壳自持滚轴，状态行不跟列表滚", () => {
    expect(logsCss).toMatch(/\.yohu-logs__list\s*\{[^}]*display:\s*flex/);
    expect(logsCss).not.toContain("yohu-logs__cols--head");
    expect(logsCss).toContain("yohu-logs__head");
    expect(logsCss).not.toContain("yohu-logs__head-line");
    expect(logsCss).toMatch(/\.yohu-logs__list-body\s*\{[^}]*overflow:\s*hidden/);
    expect(logsCss).toMatch(/\.yohu-logs__status\s*\{[^}]*flex-shrink:\s*0/);
    expect(logsCss).not.toMatch(/overflow-y:\s*(auto|scroll)/);
    expect(logsCss).not.toMatch(/overflow:\s*(auto|scroll)/);
  });

  it("列轨道不在模块 CSS 写死，行是文档不是格子", () => {
    expect(logsCss).not.toMatch(/\.yohu-logs__cols\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s*\{[^}]*grid-template-columns:/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*user-select:\s*text/);
    expect(logsCss).toMatch(/\.yohu-logs__row\s*\{[^}]*white-space:\s*pre/);
    expect(logsCss).not.toContain("::highlight(yohu-log-sel)");
    expect(logsCss).not.toContain("yohu-logs__sel-layer");
    expect(logsCss).not.toMatch(/\.yohu-logs__row\s+\.yohu-col-cell/);
    expect(logsCss).toContain("--yohu-doc-sel");
    expect(logsCss).not.toContain("var(--yohu-text-sel-fg)");
    expect(logsCss).toMatch(
      /\.yohu-logs__view \*::selection\s*\{\s*background-color:\s*transparent;\s*color:\s*inherit/,
    );
    expect(logsCss).not.toMatch(/\.yohu-logs__list \*::selection\s*\{\s*background-color:\s*var\(--yohu-doc-sel\)/);
    expect(logsCss).not.toContain("yohu-logs__row--picked");
    expect(logsCss).toContain("isolation: isolate");
    expect(logsCss).not.toContain('[data-select="cell"]');
    expect(logsCss).not.toContain(".yohu-logs__cell");
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
  it("默认 STANDARD：时间/BOTH/Tag/App/级别，headerWidth=100", () => {
    const options = defaultFormatOptions(DEFAULT_LOG_DISPLAY_COLUMNS);
    expect(headerWidth(options)).toBe(100);
    expect(formatColumns(options).map((c) => c.key)).toEqual([
      "ts",
      "pid",
      "tag",
      "app",
      "level",
      "msg",
    ]);
  });

  it("PID+TID 合成 ProcessThread BOTH，打开 UID 后 header 加 9", () => {
    const options = defaultFormatOptions(ALL_LOG_DISPLAY_COLUMNS);
    expect(formatColumns(options).map((c) => c.key)).toEqual([
      "ts",
      "uid",
      "pid",
      "tag",
      "app",
      "level",
      "msg",
    ]);
    expect(headerWidth(options)).toBe(109);
  });

  it("关闭元数据列后消息仍在", () => {
    const display = { ...DEFAULT_LOG_DISPLAY_COLUMNS, ts: false, uid: false, tag: false, app: false };
    const options = defaultFormatOptions(display);
    expect(formatColumns(options).map((c) => c.key)).toEqual(["pid", "level", "msg"]);
    expect(headerWidth(options)).toBe(12 + 4);
  });

  it("全部元数据关闭只剩消息", () => {
    const display = { ts: false, uid: false, pid: false, tid: false, tag: false, app: false, level: false };
    const options = defaultFormatOptions(display);
    expect(headerWidth(options)).toBe(0);
    expect(formatColumns(options).map((c) => c.key)).toEqual(["msg"]);
  });

  it("数据行高等于密度 token", () => {
    expect(dataRowHeight()).toBe(Density.Comfortable.rowHeight);
  });

  it("清单标题栏走 YoCol 列架，行仍是文档", () => {
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
    const editorBoard = load("editor/board.ts");
    const formatter = load("editor/format.ts");
    const documentSrc = load("editor/document.ts");
    expect(view).toContain('overflow="hidden"');
    expect(view).toContain('variant="pane"');
    expect(view).toContain("YoScroller");
    expect(view).toContain('title="重命名会话"');
    expect(view.slice(view.indexOf('title="重命名会话"'))).toMatch(
      /<YoScroller>\s*<YoTextField/,
    );
    expect(view).not.toMatch(/<YoScroller[\s\S]*?<YoVirtualList/);
    expect(view).not.toContain("visibleLogColumns");
    expect(view).toContain("LogColumnHeader");
    expect(view).toContain("logDocTrackTemplate");
    expect(view).toContain("YoColFrame");
    expect(view).toContain('cellPad="none"');
    expect(view).toContain('tone="document"');
    expect(view).toContain("logDocTrackTemplate(formatOpts(), chPx())");
    expect(view).not.toContain("formatHeader");
    expect(view).not.toContain("yohu-logs__head-line");
    expect(view).toContain("onInlineScroll");
    const header = load("LogColumnHeader.tsx");
    expect(header).toContain("YoColHeader");
    expect(header).toContain("YoColRow");
    expect(header).toContain('pad="none"');
    expect(header).toContain('tone="document"');
    expect(header).toContain("split={");
    expect(header).toContain("onWidthChange");
    expect(header).toContain("yohu-logs__head");
    expect(view).toContain("setColChars");
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
    expect(editorView).not.toContain("formatMessage");
    expect(editorView).toContain("data-tone");
    expect(editorView).toContain("data-bar");
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
    expect(filter).not.toContain("YoButton");
    expect(view).toContain("action=");
    expect(view).toContain("text={`信号 ${session.signalCount}`}");
    expect(view).toContain("EditorView");
    expect(view).not.toContain("YoVirtualList");
    expect(editorView).toContain("YoVirtualList");
    expect(editorView).toContain("itemHeight={props.itemHeight}");
    expect(editorView).toContain("yohu-doc-sel");
    expect(editorView).toContain("docSelBandStyle");
    expect(editorView).toContain("selSlice");
    expect(editorView).toContain("selectionchange");
    expect(view).toContain("itemHeight={dataRowHeight()}");
    expect(view).not.toContain("hangChars");
    expect(editorView).not.toMatch(/\bhang:\s/);
    expect(load("editor/selection.ts")).not.toContain("hang");
    expect(editorView).not.toContain("wrapBody");
    expect(editorView).not.toContain("VisualBoard");
    expect(editorView).toContain("LineBoard");
    expect(editorView).not.toContain("clipMessage");
    expect(editorView).not.toContain("wrapMessage");
    expect(editorBoard).toContain("clipMessage");
    expect(editorBoard).toContain("wrapMessage");
    expect(editorBoard).not.toContain("formatMessage");
    expect(editorView).toContain("data-layout");
    expect(editorView).not.toContain("log_line_layout");
    expect(formatter).not.toContain("log_line_layout");
    expect(formatter).toContain("softWrap");
    expect(formatter).not.toContain("clipMessage");
    expect(formatter).not.toContain("wrapMessage");
    expect(documentSrc).not.toContain("log_line_layout");
    expect(documentSrc).not.toContain("clipMessage");
    expect(documentSrc).not.toContain("wrapMessage");
    expect(view).toContain("layout={() => props.settings.log_line_layout}");
    expect(view).toContain('log_line_layout !== "wrap"');
    expect(formatter).not.toContain("log-line-layout");
    expect(documentSrc).not.toContain("log-line-layout");
    expect(logsCss).not.toContain("--yohu-log-hang");
    expect(logsCss).not.toContain("--yohu-log-board");
    expect(logsCss).toContain('[data-layout="clip"]');
    expect(editorView).not.toContain("--yohu-log-board");
    expect(editorView).toContain("contentWidth");
    expect(editorView).toContain("hostRef");
    expect(editorView).toContain("onInlineScroll");
    expect(editorView).toContain("chPx");
    expect(view).not.toContain("onInlineOffset");
    expect(view).toContain("chPx={chPx}");
    expect(view).toContain("softWrap");
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
