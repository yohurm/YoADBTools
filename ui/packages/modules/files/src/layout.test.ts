import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Density, setDensity } from "@yohu/ui";

import { controlRowHeight } from "./layout";

function loadFilesCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/files.css"),
    resolve(process.cwd(), "packages/modules/files/src/files.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const filesCss = loadFilesCss();

describe("文件表头布局契约", () => {
  it("清单行不承担左右 padding，避免把首列悬浮片推离左缘", () => {
    expect(filesCss).toMatch(/\.yohu-files__cols\s*\{[^}]*padding:\s*0/);
    expect(filesCss).not.toMatch(/\.yohu-files__cols\s*\{[^}]*padding:[^;}]*space-/);
  });

  it("表头与名称列垫交给 YoColCell，模块不自绘排序钮", () => {
    expect(filesCss).not.toContain("--yohu-col-header-content-pad:");
    expect(filesCss).not.toContain("--yohu-col-cell-pad");
    expect(filesCss).not.toContain("yohu-col-header");
    expect(filesCss).not.toContain(".yohu-files__sort");
    const tableCandidates = [
      resolve(process.cwd(), "src/FileTable.tsx"),
      resolve(process.cwd(), "packages/modules/files/src/FileTable.tsx"),
    ];
    const table =
      tableCandidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ??
      "";
    expect(table).not.toContain("yohu-virtual-list__row");
    expect(table).not.toContain("yohu-col-header__label");
    expect(table).toContain("controlRowHeight()");
    expect(table).not.toContain("FILE_ROW_HEIGHT");
    expect(table).toContain("Layout.IconSm");
    expect(table).not.toMatch(/size=\{16\}/);
    expect(filesCss).not.toMatch(/\.yohu-files__name\s*\{[^}]*padding-left/);
  });

  it("地址铬 hug，盒外不是路径栏", () => {
    const path = filesCss.match(/\.yohu-files__path\s*\{[^}]*\}/)?.[0] ?? "";
    expect(path).toContain("width: 100%");
    expect(path).toContain("cursor: default");
    expect(filesCss).not.toContain(".yohu-files__slot");
    expect(filesCss).not.toContain(".yohu-files__field");
    expect(filesCss).not.toContain(".yohu-files__crumb");
  });

  it("路径行只留上级与槽位，地址铬在 YoAddressField", () => {
    expect(filesCss).not.toContain("[data-leave");
    expect(filesCss).not.toContain("effects-exit");
    expect(filesCss).not.toContain(".yohu-files__address");
    expect(filesCss).not.toContain(".yohu-files__editor-clip");
    expect(filesCss).not.toContain(".yohu-files__vacant");
    expect(filesCss).not.toContain(".yohu-presence");
    expect(filesCss).not.toContain("100cqi");
    expect(filesCss).not.toContain("container-type");
    expect(filesCss).not.toContain(".yohu-text-field");
    expect(filesCss).not.toContain(".yohu-address");
  });

  it("拖入高亮走 YoPanel edge + VirtualList hotKey，模块不写行铬", () => {
    const tableCandidates = [
      resolve(process.cwd(), "src/FileTable.tsx"),
      resolve(process.cwd(), "packages/modules/files/src/FileTable.tsx"),
    ];
    const table =
      tableCandidates.map((path) => (existsSync(path) ? readFileSync(path, "utf-8") : "")).find(Boolean) ??
      "";
    expect(table).toContain("hotKey");
    expect(table).not.toContain("FileTableBind");
    expect(table).not.toContain("yohu-files__row--drop");
    expect(filesCss).not.toContain(".yohu-files__row--drop");
    expect(filesCss).not.toContain("yohu-files__explorer-pane--drop");
    expect(filesCss).not.toContain("--yohu-corner-edge");
    expect(filesCss).not.toMatch(/\.yohu-files__explorer--drop\s*\{[^}]*outline:/);
    expect(filesCss).not.toContain(".yohu-empty-state");
    expect(filesCss).not.toContain(".yohu-loading");
    expect(filesCss).not.toContain(".yohu-panel");
    expect(filesCss).not.toContain(".yohu-panel__body");
    expect(filesCss).not.toContain(".yohu-dialog__body");
    expect(filesCss).not.toContain(":has(");
    expect(filesCss).not.toContain("__content");
    expect(filesCss).not.toContain("__scroller");
  });
});

describe("文件清单行高", () => {
  it("与日志 controlRowHeight 同池", () => {
    setDensity("compact");
    expect(controlRowHeight()).toBe(Density.Compact.controlHeight);
    setDensity("comfortable");
    expect(controlRowHeight()).toBe(Density.Comfortable.controlHeight);
  });
});

function loadAddressSlot(): string {
  const candidates = [
    resolve(process.cwd(), "src/AddressSlot.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/AddressSlot.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("地址槽接线", () => {
  it("只挂 YoAddressField，不自造输入", () => {
    const slot = loadAddressSlot();
    expect(slot).toContain("YoAddressField");
    expect(slot).not.toContain("<input");
    expect(slot).not.toContain("./address-edit");
    expect(slot).not.toContain("addressClickKind");
    expect(slot).not.toContain("addressDismissOutside");
    expect(slot).not.toContain("addressOpenCaret");
  });
});

function loadTransferDock(): string {
  const candidates = [
    resolve(process.cwd(), "src/TransferDock.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/TransferDock.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const transferDock = loadTransferDock();

describe("传输坞开合契约", () => {
  it("整块走 Presence rise，列表走一层 YoCollapse，行不套第二张卡", () => {
    expect(transferDock).toContain('recipe="rise"');
    expect(transferDock).toContain("YoPresence");
    expect(transferDock.match(/<YoCollapse /g)?.length).toBe(1);
    expect(transferDock).toContain('recipe="panel"');
    expect(transferDock).not.toMatch(/<YoScroller[\s>]/);
    expect(transferDock).not.toMatch(/<YoCorner[\s>]/);
    expect(transferDock).toContain("yohu-recipe-tree-chevron");
    expect(transferDock).toContain("toggleTransfers");
    expect(transferDock).toContain("YoButton");
    expect(transferDock).toContain("block");
    expect(transferDock).not.toContain("<button");
    expect(transferDock).not.toContain("TransferPanel");
    expect(transferDock).not.toContain("overflowX");
  });

  it("模块 CSS 不自写 animation / 原生 overflow auto，帽高走 layout token", () => {
    expect(filesCss).not.toMatch(/animation\s*:/);
    expect(filesCss).not.toMatch(/overflow:\s*auto/);
    expect(filesCss).not.toMatch(/overflow-y:\s*auto/);
    expect(filesCss).not.toMatch(/overflow:\s*scroll/);
    expect(filesCss).not.toMatch(/overflow-y:\s*scroll/);
    expect(filesCss).toContain(".yohu-files__transfer-bar");
    expect(filesCss).toContain("max-height: var(--yohu-layout-output-max)");
    expect(filesCss).not.toContain(".yohu-files__transfer-viewport");
    expect(filesCss).not.toContain(".yohu-files__transfer-chrome");
  });
});

function loadPreviewPane(): string {
  const candidates = [
    resolve(process.cwd(), "src/PreviewPane.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/PreviewPane.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const previewPane = loadPreviewPane();

describe("预览图标尺寸", () => {
  it("只消费 Layout.IconPreview，不写死 48", () => {
    expect(previewPane).toContain("Layout.IconPreview");
    expect(previewPane).not.toMatch(/size=\{48\}/);
    expect(previewPane).toContain('overflow="hidden"');
    expect(previewPane).toContain("YoEmptyState");
    expect(previewPane).toContain("YoScroller");
    expect(previewPane).toContain("YoDescriptionList");
    expect(previewPane).not.toContain("<dl");
    expect(previewPane).not.toContain("yohu-files__preview-empty");
    expect(previewPane).not.toContain("overflowX");
    expect(filesCss).not.toContain(".yohu-files__preview-empty");
    expect(filesCss).not.toContain(".yohu-files__preview-meta");
    expect(filesCss).not.toContain(".yohu-scroller");
    expect(filesCss).not.toContain(".yohu-scroller__view");
  });
});

function loadFileView(): string {
  const candidates = [
    resolve(process.cwd(), "src/FileView.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/FileView.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const fileView = loadFileView();

function loadDrop(): string {
  const candidates = [
    resolve(process.cwd(), "src/drop.ts"),
    resolve(process.cwd(), "packages/modules/files/src/drop.ts"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const dropSrc = loadDrop();

describe("官方拖放契约", () => {
  it("api 形状进 dest；换算不读 globalThis", () => {
    expect(dropSrc).toContain("NativeDragDropEvent");
    expect(dropSrc).toContain("cssPointFromPhysical");
    expect(dropSrc).not.toContain("DropDragEvent");
    expect(dropSrc).not.toContain("devicePixelRatio");
    expect(dropSrc).not.toContain("globalThis");
    expect(dropSrc).not.toContain("files.dropIn");
    expect(fileView).toContain("yohu-recipe-preview");
    expect(fileView).not.toContain("yohu-recipe-rail");
    expect(fileView).toContain("onNativeDragDrop");
    expect(fileView).toContain("listRef");
    expect(fileView).not.toContain('querySelector(".yohu-virtual-list")');
    expect(fileView).not.toContain("files.dropIn");
    expect(fileView).not.toContain("ondrop=");
    expect(fileView).toContain('edge={dropHot() ? "drop" : undefined}');
    expect(fileView).not.toContain("explorer-pane--drop");
    expect(fileView).not.toContain("yohu-files__explorer-pane");
    expect(fileView).not.toContain("deviceLabel");
    expect(fileView).toContain("selectedLabel");
    expect(fileView).not.toContain("overflowX");
  });
});

function loadDeleteTargets(): string {
  const candidates = [
    resolve(process.cwd(), "src/DeleteTargets.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/DeleteTargets.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const deleteTargets = loadDeleteTargets();

describe("确认删除多文件契约", () => {
  it("弹窗走 Dialog lead/main/tail，不把文件名拼成一段", () => {
    expect(fileView).toContain("DeleteConfirm");
    expect(fileView).toContain("DeleteTargetList");
    expect(fileView).toContain("DeleteExpand");
    expect(fileView).toContain("YoScroller");
    expect(fileView).toContain("bodyLead");
    expect(fileView).toContain("bodyTail");
    expect(fileView).not.toContain('bodyOverflow="hidden"');
    expect(fileView).toContain('initial="footer"');
    expect(fileView).not.toContain('join("、")');
    const deleteFooter = fileView.slice(fileView.indexOf("确认删除"), fileView.indexOf("新建目录"));
    expect(deleteFooter).toMatch(/<YoScroller[\s>]/);
    expect(deleteFooter).toContain('variant="ghost"');
    expect(deleteFooter).toContain('tone="accent"');
    expect(deleteFooter).toContain('tone="danger"');
    expect(deleteFooter).not.toContain('tone="neutral"');
    const createDialog = fileView.slice(fileView.indexOf("新建目录"));
    expect(createDialog).toMatch(/<YoScroller[\s>]/);
    expect(createDialog).toContain("YoTextField");
    expect(createDialog).toContain("YoCorner");
    expect(fileView).toContain("createReady");
    expect(fileView).toContain("TransferDock");
    expect(fileView).not.toContain("TransferPanel");
    expect(fileView).toContain('overflow="hidden"');
    expect(fileView).toContain("attachView");
    expect(fileView).toContain("dropSessionForEvent");
    expect(fileView).toContain("adoptDropSession");
    expect(fileView).toContain("destDirFromEntries");
    expect(fileView).not.toContain("destDirName(");
    expect(fileView).toContain("dropCommit");
    expect(fileView).toContain("event.position");
    expect(fileView).toContain("devicePixelRatio");
    expect(fileView).not.toContain("event.x");
    expect(fileView).not.toContain("resolveDropAt");
    expect(fileView).not.toContain("applyDropEvent");
    expect(fileView).not.toContain("elementFromPoint");
    expect(fileView).not.toContain("pointInElement");
    expect(fileView).not.toContain("files.dropIn");
    expect(fileView).not.toContain("ondrop=");
    expect(fileView).not.toContain("DataTransfer.files");
    expect(fileView).toContain("dropHot");
  });

  it("open 独立于名单，出场后再清载荷", () => {
    expect(fileView).toContain("deleteOpen");
    expect(fileView).toContain("onExitComplete");
    expect(fileView).toContain("finishDelete");
    expect(fileView).toContain("open={deleteOpen}");
    expect(fileView).not.toContain("open={() => deleteNames().length");
    const closeBlock = fileView.slice(fileView.indexOf("const closeDelete"), fileView.indexOf("const finishDelete"));
    expect(closeBlock).toContain("setDeleteOpen(false)");
    expect(closeBlock).not.toContain("setDeleteNames");
    expect(closeBlock).not.toContain("setDeleteExpanded");
  });

  it("超出预览走一层 YoReveal", () => {
    expect(deleteTargets).toContain("YoReveal");
    expect(deleteTargets).not.toContain("YoCollapse");
    expect(deleteTargets).not.toContain('recipe="clip"');
    expect(deleteTargets).not.toContain('recipe="panel"');
    expect(deleteTargets.match(/<YoReveal /g)?.length).toBe(1);
  });

  it("芯片网格走 YoChip leading + dismiss，不自造关闭钮", () => {
    expect(filesCss).toMatch(
      /\.yohu-files__delete-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/,
    );
    expect(filesCss).toMatch(
      /\.yohu-files__delete-grid\s*\{[^}]*gap:\s*var\(--yohu-space-sm\)/,
    );
    expect(deleteTargets).toContain("yohu-files__delete-list");
    expect(deleteTargets).toContain("yohu-files__delete-rest");
    expect(deleteTargets).not.toContain("yohu-files__delete-more");
    expect(filesCss).toContain(".yohu-files__delete-list");
    expect(filesCss).toContain(".yohu-files__delete-rest");
    expect(filesCss).not.toContain("grid-column: 1 / -1");
    expect(filesCss).not.toContain("delete-more");
    expect(filesCss).not.toContain("delete-grid--rest");
    expect(deleteTargets).not.toContain("delete-grid--rest");
    expect(deleteTargets).toContain("YoChip");
    expect(deleteTargets).toContain("block");
    expect(deleteTargets).not.toContain("dismiss=");
    expect(deleteTargets).toContain("onDismiss");
    expect(deleteTargets).toContain("YoFileIcon");
    expect(deleteTargets).not.toContain("yohu-files__delete-chip-remove");
    expect(filesCss).not.toContain(".yohu-files__delete-chip-remove");
    expect(deleteTargets).not.toContain("delete-scroller");
    expect(filesCss).not.toContain(".yohu-files__delete-scroller");
    expect(filesCss).not.toContain(".yohu-files__delete {");
    const deleteBlock = filesCss.slice(filesCss.indexOf(".yohu-files__confirm {"));
    expect(deleteBlock).not.toMatch(/overflow:\s*auto/);
    expect(deleteBlock).not.toMatch(/overflow-y:\s*auto/);
  });
});

describe("磁盘幽灵", () => {
  it("address-edit / TransferPanel / store / progress 已不在磁盘", () => {
    const names = [
      "address-edit.ts",
      "address-edit.test.ts",
      "TransferPanel.tsx",
      "TransferPanel.test.tsx",
      "store.ts",
      "store.test.ts",
      "progress.ts",
      "progress.test.ts",
    ];
    for (const name of names) {
      const candidates = [
        resolve(process.cwd(), `src/${name}`),
        resolve(process.cwd(), `packages/modules/files/src/${name}`),
      ];
      expect(candidates.some((path) => existsSync(path)), name).toBe(false);
    }
  });
});
