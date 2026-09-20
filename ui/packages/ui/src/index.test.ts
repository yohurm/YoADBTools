import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as ui from "./index";
import type { ContextMenuController, Toaster } from "./index";

/** 公开 Yo* 组件清单（与 index.ts 分组导出对齐）。 */
const YO_PUBLIC = [
  "YoFileIcon",
  // 按钮与选择 / 文本与输入 / 信息展示
  "YoButton",
  "YoSegmentedButton",
  "YoIconButton",
  "YoThemeToggle",
  "YoTextField",
  "YoSelect",
  "YoCheckbox",
  "YoSwitch",
  "YoBadge",
  "YoChip",
  "YoStatusDot",
  "YoDivider",
  "YoSubheader",
  "YoListItem",
  "YoDescriptionList",
  "YoAddressField",
  "YoSearch",
  "YoProgressBar",
  // 容器 / 列表 / 滚动 / 栅格 / 导航
  "YoToolbar",
  "YoTabs",
  "YoTree",
  "YoScroller",
  "YoVirtualList",
  "YoReorderList",
  "YoColResizer",
  "YoColHeader",
  "YoColFrame",
  "YoColRow",
  "YoColTrack",
  "YoColCell",
  "YoPanel",
  "YoPage",
  "YoFormRow",
  "YoCorner",

  // 空态与加载 / 弹窗
  "YoEmptyState",
  "YoLoading",
  "YoDialog",
  "YoTooltip",
  "YoTooltipHost",
  "YoContextMenuHost",
  "YoToast",
  "YoToaster",
  "YoPresence",
  "YoListPresence",
  "YoCollapse",
  "YoReveal",
  "YoTravel",
  "YoGrow",
  "YoSwap",
  "YoIndicator",
  // 窗口铬
  "YoChrome",
  "YoTitleBar",
  "YoStatusBar",
  "YoRail",
  "YoRailSlot",
] as const;

const ADDRESS_PUBLIC = [
  "addressClickKind",
  "addressDismissOutside",
  "addressOpenCaret",
  "addressScrollPin",
  "addressCrumbPath",
  "isAddressVacantClick",
] as const;

const SEARCH_PUBLIC = [
  "createSearchEngine",
  "expandSearchGroups",
  "normalizeSearchQuery",
  "searchDocuments",
  "searchFieldHit",
  "searchHighlightRanges",
  "tokenizeSearchQuery",
] as const;

describe("@yohu/ui 公开组件清单", () => {
  it("分组导出的 Yo* 均为函数", () => {
    for (const name of YO_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("含 YoSwitch 与 YoTitleBar", () => {
    expect(ui.YoSwitch).toBeTypeOf("function");
    expect(ui.YoTitleBar).toBeTypeOf("function");
    expect(ui.docSelBandStyle).toBeTypeOf("function");
  });

  it("公开地址策略、搜索引擎与 YoRail", () => {
    expect(ui.YoRail).toBeTypeOf("function");
    for (const name of ADDRESS_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
    }
    for (const name of SEARCH_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
    }
  });

  it("不公开 fileGlyphFor / FileGlyph", () => {
    expect((ui as Record<string, unknown>).fileGlyphFor).toBeUndefined();
    expect(Object.keys(ui)).not.toContain("fileGlyphFor");
  });

  it("包入口不导出菜单 Session / Toast 队列项 / 列宽相位 / wipe 帧", () => {
    const candidates = [
      resolve(process.cwd(), "src/index.ts"),
      resolve(process.cwd(), "packages/ui/src/index.ts"),
    ];
    let index = "";
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        index = readFileSync(candidate, "utf-8");
        break;
      }
    }
    expect(index.length).toBeGreaterThan(0);
    expect(index).not.toContain("ContextMenuSession");
    expect(index).not.toContain("ToastItem");
    expect(index).not.toContain("ColResizePhase");
    expect(index).not.toContain("ReorderBinder");
    expect(index).not.toContain("createReorderBinder");
    expect(index).not.toContain("dropIndexFromCenters");
    expect(index).not.toContain("YOHU_FOCUS_ATTR");
    expect(index).not.toContain("YOHU_FOCUS_KEYBOARD");
    expect(index).not.toContain("YoChipDismiss");
    expect(index).not.toContain("bindTravel");
    expect(index).not.toContain("bindGrow");
    expect(index).not.toContain("bindHugTravel");
    expect(index).not.toContain("TravelRoot");
    expect(index).not.toContain("useTravel");
    expect(index).not.toContain("useGrow");
    expect(index).not.toContain("useCollapseTravel");
    expect(index).not.toContain("useScrollerPort");
    expect(index).not.toContain("ScrollerPort");
    expect(index).not.toContain("resolveScrollerScrollEnd");
    expect(index).not.toContain("RailPresentation");
    expect(index).not.toContain("railLayoutExpanded");
    expect(index).not.toContain("railCopyOpaque");
    expect(index).not.toContain("railBlockHidden");
    expect(index).not.toContain("YoListRow");
    expect(index).not.toContain("list-row");
    expect(index).not.toContain("YoListFrame");
    expect(index).not.toContain("list-frame");
    expect(index).not.toContain("createTooltipUnique");
    expect(index).not.toContain("dismissTooltipOverlay");
    expect(index).not.toContain("tooltipUnique");
    expect(index).not.toContain("dialogInitialFocus");
    expect(index).not.toContain("pushDialog");
    expect(index).not.toContain("popDialog");
    expect(index).not.toContain("attachDialog");
    expect(index).not.toContain("THEME_WIPE_COVERAGE");
    expect(index).not.toContain("themeWipeFrames");
    expect(index).not.toContain("themeWipeRadius");
  });

  it("motion barrel 不漏 useTravel / useGrow / useCollapseTravel / RailPresentation / wipe 帧", () => {
    const candidates = [
      resolve(process.cwd(), "src/motion/index.ts"),
      resolve(process.cwd(), "packages/ui/src/motion/index.ts"),
    ];
    let barrel = "";
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        barrel = readFileSync(candidate, "utf-8");
        break;
      }
    }
    expect(barrel.length).toBeGreaterThan(0);
    expect(barrel).not.toContain("useTravel");
    expect(barrel).not.toContain("useGrow");
    expect(barrel).not.toContain("useCollapseTravel");
    expect(barrel).not.toContain("RailPresentation");
    expect(barrel).not.toContain("railLayoutExpanded");
    expect(barrel).not.toContain("railCopyOpaque");
    expect(barrel).not.toContain("railBlockHidden");
    expect(barrel).not.toContain("THEME_WIPE_COVERAGE");
    expect(barrel).not.toContain("themeWipeFrames");
    expect(barrel).not.toContain("themeWipeRadius");
  });

  it("公开 Controller / Toaster 只有模块契约字段", () => {
    const menu: Record<keyof ContextMenuController, true> = {
      open: true,
      close: true,
      refine: true,
    };
    const toaster: Record<keyof Toaster, true> = {
      show: true,
      dismiss: true,
      destroy: true,
    };
    expect(Object.keys(menu).sort()).toEqual(["close", "open", "refine"]);
    expect(Object.keys(toaster).sort()).toEqual(["destroy", "dismiss", "show"]);
  });

  it("不公开 form L2/L3", () => {
    const candidates = [
      resolve(process.cwd(), "src/index.ts"),
      resolve(process.cwd(), "packages/ui/src/index.ts"),
    ];
    let index = "";
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        index = readFileSync(candidate, "utf-8");
        break;
      }
    }
    expect(index.length).toBeGreaterThan(0);
    const locked = [
      "layoutSelectMenu",
      "applyPopoverBox",
      "readSelectTrigger",
      "findOption",
      "optionDomId",
      "selectedIndex",
      "stepIndex",
      "edgeIndex",
      "selectKeyIntent",
      "idleSelectSession",
      "selectIsDisabled",
      "openSelect",
      "closeSelect",
      "toggleSelect",
      "applySelectKey",
      "applySelectEscape",
      "selectHostAttrs",
      "TEXT_FIELD_STATUSES",
      "TEXT_FIELD_CONTROL_OVERFLOW",
      "resolveTextFieldStatus",
      "hasTextFieldSlot",
      "resolveTextFieldSlots",
      "resolveTextFieldWidthKind",
      "resolveTextFieldMultiline",
      "resolveTextFieldRows",
      "resolveTextFieldActive",
      "resolveTextFieldSpec",
      "textFieldLineBoxPx",
      "textFieldPaintKind",
      "resolveTextFieldInteractive",
      "textFieldHostAttrs",
      "DEFAULT_TEXT_FIELD_STATUS",
      "DEFAULT_TEXT_FIELD_ROWS",
      "searchHostAttrs",
      "resolveSearchSlot",
      "searchShowsEntry",
      "searchShowsBar",
      "resolveSearchOpen",
      "resolveSearchCancel",
      "resolveSearchStatus",
      "searchPaintKind",
      "resolveSearchWidth",
      "searchShowClear",
      "resolveSearchActive",
      "searchEntryPressed",
    ] as const;
    for (const name of locked) {
      expect((ui as Record<string, unknown>)[name], name).toBeUndefined();
      expect(index, name).not.toContain(name);
    }
    for (const name of ADDRESS_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
      expect(index).toContain(name);
    }
    for (const name of SEARCH_PUBLIC) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe("function");
      expect(index).toContain(name);
    }
  });
});
