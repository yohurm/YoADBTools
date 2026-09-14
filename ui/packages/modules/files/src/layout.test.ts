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
    expect(filesCss).toMatch(/\.yohu-files__slot\s*\{[^}]*width:\s*max-content/);
    expect(filesCss).toMatch(/\.yohu-files__slot\s*\{[^}]*flex:\s*0 1 auto/);
    expect(filesCss).not.toMatch(/\.yohu-files__slot-hit\s*\{[^}]*flex:\s*1 1 auto/);
    expect(filesCss).toMatch(/\.yohu-files__crumbs\[inert\]\s*\{[^}]*display:\s*none/);
    expect(filesCss).toMatch(/\.yohu-files__field\[data-gate\]\s*\{[^}]*pointer-events:\s*none/);
  });

  it("路径行只有一条地址槽：展开与收回共用 clip-path", () => {
    expect(filesCss).toContain(".yohu-files__slot");
    expect(filesCss).toContain(".yohu-files__slot-hit");
    expect(filesCss).toContain(".yohu-files__field");
    expect(filesCss).toContain("grid-area: 1 / 1");
    expect(filesCss).toContain("clip-path: inset(0 100% 0 0)");
    expect(filesCss).toContain("clip-path var(--yohu-motion-spatial-local)");
    expect(filesCss).not.toContain("width var(--yohu-motion-spatial-local)");
    expect(filesCss).toMatch(/\.yohu-files__field\s*\{[^}]*width:\s*max-content/);
    expect(filesCss).toMatch(/\.yohu-files__field\s*\{[^}]*max-width:\s*100%/);
    expect(filesCss).toMatch(/\.yohu-files__field\s*\{[^}]*justify-self:\s*start/);
    expect(filesCss).not.toMatch(/\.yohu-files__field\s*\{[^}]*(?<![-])width:\s*100%/);
    const fieldInput = filesCss.match(/\.yohu-files__field-input\s*\{[^}]*\}/)?.[0] ?? "";
    expect(fieldInput).toContain("field-sizing: content");
    expect(fieldInput).toContain("width: auto");
    expect(fieldInput).toContain("min-width: 0");
    expect(fieldInput).not.toMatch(/min-width:\s*100%/);
    expect(fieldInput).not.toMatch(/(?<![-])width:\s*100%/);
    expect(fieldInput).not.toMatch(/flex:\s*1/);
    expect(filesCss).not.toContain("[data-leave");
    expect(filesCss).not.toContain("effects-exit");
    expect(filesCss).not.toContain(".yohu-files__address");
    expect(filesCss).not.toContain(".yohu-files__editor-clip");
    expect(filesCss).not.toContain(".yohu-files__vacant");
    expect(filesCss).not.toContain(".yohu-presence");
    expect(filesCss).not.toContain("100cqi");
    expect(filesCss).not.toContain("container-type");
    expect(filesCss).not.toContain(".yohu-text-field");
    expect(filesCss).toMatch(
      /\.yohu-files__field\s*\{[^}]*border:\s*var\(--yohu-stroke-hairline\)\s+solid\s+var\(--yohu-accent\)/,
    );
    expect(filesCss).toMatch(/\.yohu-files__field\s*\{[^}]*border-radius:\s*var\(--yohu-radius-sm\)/);
    expect(filesCss).toMatch(/\.yohu-files__slot\s*\{[^}]*height:\s*var\(--yohu-control-height\)/);
  });

  it("拖入高亮走 accent token", () => {
    expect(filesCss).toContain(".yohu-files__explorer--drop");
    expect(filesCss).toContain(".yohu-files__row--drop");
    expect(filesCss).toContain("var(--yohu-accent-soft)");
    expect(filesCss).toContain("var(--yohu-accent)");
    expect(filesCss).toContain("var(--yohu-stroke-accent)");
    const drop =
      filesCss.match(/\.yohu-files__explorer--drop\s+\.yohu-files__explorer-pane\s*\{[^}]*\}/)?.[0] ?? "";
    expect(drop).toContain("outline:");
    expect(drop).toContain("var(--yohu-accent-soft)");
    expect(filesCss).not.toContain(".yohu-empty-state");
    expect(filesCss).not.toContain(".yohu-loading");
    expect(filesCss).not.toContain(".yohu-panel");
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

describe("地址铬 clip 时长", () => {
  it("只消费 spatialLocal，不加 50", () => {
    const slot = loadAddressSlot();
    expect(slot).toContain('motionSpecMs("spatialLocal")');
    expect(slot).not.toMatch(/spatialLocal"\)\s*\+\s*50/);
  });
});

function loadTransferPanel(): string {
  const candidates = [
    resolve(process.cwd(), "src/TransferPanel.tsx"),
    resolve(process.cwd(), "packages/modules/files/src/TransferPanel.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const transferPanel = loadTransferPanel();

describe("传输面板开合契约", () => {
  it("整块走 Presence rise，列表走一层 YoCollapse panel，箭头走 tree-chevron", () => {
    expect(transferPanel).toContain('recipe="rise"');
    expect(transferPanel).toContain("YoPresence");
    expect(transferPanel.match(/<YoCollapse /g)?.length).toBe(1);
    expect(transferPanel).toContain('recipe="panel"');
    expect(transferPanel).toContain("yohu-recipe-tree-chevron");
    expect(transferPanel).toContain("toggleTransfers");
  });

  it("模块 CSS 不自写 animation，列表帽高走 layout token", () => {
    expect(filesCss).not.toMatch(/animation\s*:/);
    expect(filesCss).toContain(".yohu-files__transfer-bar");
    expect(filesCss).toContain("max-height: var(--yohu-layout-output-max)");
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
  it("弹窗走 DeleteTargets，不把文件名拼成一段", () => {
    expect(fileView).toContain("DeleteTargets");
    expect(fileView).toContain('bodyOverflow="hidden"');
    expect(fileView).not.toContain('join("、")');
  });

  it("超出预览走一层 YoCollapse panel", () => {
    expect(deleteTargets).toContain("YoCollapse");
    expect(deleteTargets).toContain('recipe="panel"');
    expect(deleteTargets.match(/<YoCollapse /g)?.length).toBe(1);
  });

  it("芯片网格走 YoChip leading + dismiss，不自造关闭钮", () => {
    expect(filesCss).toMatch(
      /\.yohu-files__delete-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/,
    );
    expect(deleteTargets).toContain("YoChip");
    expect(deleteTargets).toContain('dismiss="hover"');
    expect(deleteTargets).toContain("YoFileIcon");
    expect(deleteTargets).not.toContain("yohu-files__delete-chip-remove");
    expect(filesCss).not.toContain(".yohu-files__delete-chip-remove");
    expect(filesCss).toContain(".yohu-files__delete-scroller");
    expect(filesCss).toContain("max-height: var(--yohu-layout-output-max)");
  });
});
