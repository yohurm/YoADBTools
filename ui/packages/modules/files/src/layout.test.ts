import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(filesCss).not.toMatch(/\.yohu-files__name\s*\{[^}]*padding-left/);
  });

  it("路径行只有一条地址槽：展开与收回共用 clip-path", () => {
    expect(filesCss).toContain(".yohu-files__slot");
    expect(filesCss).toContain(".yohu-files__slot-hit");
    expect(filesCss).toContain(".yohu-files__field");
    expect(filesCss).toContain("grid-area: 1 / 1");
    expect(filesCss).toContain("clip-path: inset(0 100% 0 0)");
    expect(filesCss).toContain("clip-path var(--yohu-motion-spatial-local)");
    expect(filesCss).not.toContain("width var(--yohu-motion-spatial-local)");
    const fieldInput = filesCss.match(/\.yohu-files__field-input\s*\{[^}]*\}/)?.[0] ?? "";
    expect(fieldInput).toContain("field-sizing: content");
    expect(fieldInput).toContain("width: auto");
    expect(fieldInput).toContain("min-width: 100%");
    expect(fieldInput).not.toMatch(/(?<![-])width:\s*100%/);
    expect(fieldInput).not.toMatch(/min-width:\s*0/);
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
