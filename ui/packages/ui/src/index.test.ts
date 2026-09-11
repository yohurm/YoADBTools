import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as ui from "./index";
import type { ContextMenuController, Toaster } from "./index";

/** 公开 Yo* 组件清单（与 index.ts 分组导出对齐）。 */
const YO_PUBLIC = [
  "YoFileIcon",
  // 基础
  "YoButton",
  "YoSegmentedButton",
  "YoIconButton",
  "YoThemeToggle",
  "YoTextField",
  "YoSelect",
  "YoCheckbox",
  "YoSwitch",
  "YoBadge",
  "YoProgressBar",
  // 导航
  "YoToolbar",
  "YoTabs",
  "YoTree",
  "YoVirtualList",
  "YoColResizer",
  "YoColHeader",
  "YoColFrame",
  "YoColRow",
  "YoColTrack",
  "YoColCell",
  "YoPanel",
  "YoPage",
  "YoFormRow",

  // 反馈
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
  "YoSwap",
  "YoIndicator",
  // 窗口铬
  "YoChrome",
  "YoTitleBar",
  "YoStatusBar",
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
  });

  it("不公开 fileGlyphFor / FileGlyph", () => {
    expect((ui as Record<string, unknown>).fileGlyphFor).toBeUndefined();
    expect(Object.keys(ui)).not.toContain("fileGlyphFor");
  });

  it("包入口不导出菜单 Session / Toast 队列项 / 列宽相位", () => {
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
});
