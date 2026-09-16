import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function load(name: string): string {
  const candidates = [
    resolve(process.cwd(), `src/${name}`),
    resolve(process.cwd(), `packages/modules/terminal/src/${name}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

const view = [
  load("TerminalView.tsx"),
  load("CommandTree.tsx"),
  load("ResultStream.tsx"),
  load("Composer.tsx"),
].join("\n");
const css = load("terminal.css");

describe("命令终端动效接线", () => {
  it("IO 流与队列走 YoListPresence，清屏直切、排队可出场", () => {
    expect(view).toContain("YoListPresence");
    expect(view).toContain("exit={false}");
    expect(view).toContain("key={(line) => line.id}");
    expect(view).toContain("key={(item) => item.id}");
    expect(view).toContain("motionSpecMs");
    expect(view).toContain('motionSpecMs("spatialLocal")');
  });

  it("发送栏贴右横向开合，禁止纵向 XOR panel", () => {
    expect(view).toContain("yohu-recipe-inline-end");
    expect(view).toContain("data-open={open() ? \"true\" : \"false\"}");
    expect(view).toContain("chevron-right");
    expect(view).toContain("chevron-left");
    expect(view).not.toContain("yohu-recipe-xor");
    expect(view).not.toContain("YoCollapse");
    expect(view).not.toContain("Show when={!composerOpen()}");
    expect(css).toContain("container-type: inline-size");
    expect(view).toContain("YoCorner");
    expect(view).toContain("yohu-terminal__dock-chrome");
    expect(css).not.toContain("border-start-start-radius");
    expect(css).not.toContain("border-block-start");
    expect(css).not.toContain("border-inline-start");
  });

  it("模块 CSS 不自写 animation / keyframes", () => {
    expect(css).not.toMatch(/animation\s*:/);
    expect(css).not.toMatch(/@keyframes/);
  });

  it("有内容时发送图标挂 send-aim，空内容不朝上", () => {
    expect(view).toContain("yohu-recipe-send-aim");
    expect(view).toContain('data-armed={canSend() ? "true" : "false"}');
    expect(view).toContain('icon="send"');
    expect(css).not.toContain("rotate(");
  });

  it("composer 走 YoTextField multiline，不自挂 textarea 壳", () => {
    const composer = load("Composer.tsx");
    expect(composer).toContain("YoTextField");
    expect(composer).toContain("multiline");
    expect(composer).toContain("rows={1}");
    expect(composer).not.toContain("<textarea");
    expect(composer).not.toContain("YoTextArea");
    expect(composer).not.toContain("yohu-text-field__control");
    expect(composer).not.toContain("yohu-text-field__input");
    expect(composer).not.toContain("yohu-terminal__composer-input");
    expect(css).not.toContain(".yohu-terminal__composer-input");
    expect(css).not.toContain(".yohu-text-field");
    expect(css).toContain(".yohu-terminal__composer-field");
    expect(css).toContain("var(--yohu-font-mono)");
    expect(css).not.toContain(".yohu-terminal__send .yohu-icon-button:disabled");
  });

  it("结果区与参数对话框走公开契约，不点内部槽、不挖 input", () => {
    expect(view).toContain('overflow="hidden"');
    expect(view).not.toContain('querySelectorAll("input")');
    expect(view).not.toContain("fieldsRoot");
    expect(css).not.toContain(".yohu-panel__body");
    const manager = load("CommandManager.tsx");
    const managerCss = load("command-manager.css");
    expect(manager).toContain('bodyOverflow="hidden"');
    expect(manager).toContain('bodyPad="none"');
    expect(managerCss).not.toContain(".yohu-dialog__body");
    const params = load("ParameterDialog.tsx");
    expect(params).toContain("原始命令");
    expect(params).toContain("填写参数");
    expect(params).not.toContain("预览");
    expect(params).not.toContain("previewFill");
    expect(params).not.toContain('querySelectorAll("input")');
    expect(load("manager/TemplateField.tsx")).toContain("插入参数");
    expect(load("manager/TemplateField.tsx")).not.toContain("插入 {");
    expect(load("manager/CommandEditor.tsx")).toContain("commandTemplateLabel");
    expect(load("manager/CommandEditor.tsx")).toContain("ParamDescriptions");
    expect(load("manager/CommandEditor.tsx")).toContain("TemplateField");
    expect(load("manager/BlockEditor.tsx")).toContain("ParamDescriptions");
    expect(load("manager/BlockEditor.tsx")).toContain("BlockSteps");
    expect(load("manager/EditorColumn.tsx")).toContain("editorTarget");
    expect(load("manager/EditorColumn.tsx")).toContain("createMemo");
    expect(load("manager/EditorColumn.tsx")).not.toContain("entry.kind ===");
    expect(load("manager/EditorColumn.tsx")).not.toContain("<Switch");
    expect(load("manager/TemplateField.tsx")).toContain("insertPlaceholderAtDisplay");
    expect(load("manager/BlockSteps.tsx")).toContain("TemplateField");
    const templateBlock = managerCss.slice(managerCss.indexOf(".yohu-cm__template {"));
    const templateRule = templateBlock.slice(0, templateBlock.indexOf("}") + 1);
    expect(templateRule).toContain("flex: 0 1 auto");
    expect(templateRule).not.toMatch(/flex:\s*1\s*;/);
    expect(managerCss).not.toContain(".yohu-text-field");
  });

  it("流/排队认 data-first，命令管理走 Toolbar pad，不点内部根", () => {
    expect(css).toContain("[data-first]");
    expect(css).not.toContain(".yohu-presence");
    const manager = [
      load("CommandManager.tsx"),
      load("manager/GroupColumn.tsx"),
      load("manager/EntryColumn.tsx"),
    ].join("\n");
    const managerCss = load("command-manager.css");
    expect(manager).toContain('pad="xs"');
    expect(manager).toContain("YoVirtualList");
    expect(manager).toContain("YoPanel");
    expect(load("manager/GroupColumn.tsx")).toContain("onReorder");
    expect(load("manager/EntryColumn.tsx")).toContain("onReorder");
    expect(load("manager/GroupColumn.tsx")).not.toContain("./reorder");
    expect(load("manager/GroupColumn.tsx")).not.toContain("querySelector");
    expect(load("manager/EntryColumn.tsx")).not.toContain("querySelector");
    expect(load("manager/store.ts")).toContain('from "@yohu/ui"');
    expect(load("manager/store.ts")).toContain("moveItemTo");
    expect(load("manager/store.ts")).not.toContain("shiftGroup");
    expect(load("manager/store.ts")).not.toContain("shiftEntry");
    expect(load("manager/store.ts")).not.toContain("./reorder");
    expect(load("manager/BlockSteps.tsx")).toContain("YoReorderList");
    expect(load("manager/BlockSteps.tsx")).not.toContain("dropIndexFromCenters");
    expect(load("manager/BlockSteps.tsx")).not.toContain("shiftForReorder");
    expect(load("manager/BlockSteps.tsx")).not.toContain("querySelector");
    expect(load("manager/BlockSteps.tsx")).not.toContain("./reorder");
    expect(load("manager/BlockSteps.tsx")).not.toContain("yohu-cm__step-grip");
    expect(load("manager/BlockSteps.tsx")).not.toContain('name="grip"');
    expect(load("manager/BlockSteps.tsx")).not.toContain("onShift");
    expect(load("manager/EntryColumn.tsx")).toContain('tone="list"');
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColFrame");
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColTrack");
    expect(load("manager/EditorColumn.tsx")).toContain('variant="pane"');
    expect(load("manager/EditorColumn.tsx")).not.toContain("<div class=\"yohu-cm__editor\"");
    expect(manager).toContain("pointerSelectMode");
    expect(manager).toContain("attachPanelKeys");
    expect(manager).toContain("COMMAND_MANAGER_KEY_BINDINGS");
    expect(manager).toContain("openContextMenu");
    expect(manager).toContain("terminalCommandMenu");
    expect(manager).not.toContain("<YoContextMenu");
    expect(manager).not.toContain("<ul");
    expect(manager).not.toContain("<li");
    expect(load("CommandManager.tsx")).not.toContain("querySelectorAll");
    expect(load("CommandManager.tsx")).not.toContain("createStore");
    const managerStore = load("manager/store.ts");
    expect(managerStore).not.toMatch(/from ["']\.\.\/store["']/);
    expect(managerStore).not.toContain("openContextMenu");
    expect(managerStore).not.toContain("clipboard");
    expect(managerStore).not.toContain("querySelector");
    expect(managerCss).not.toContain(".yohu-toolbar");
    expect(managerCss).not.toContain(".yohu-panel");
    expect(managerCss).toContain(".yohu-cm__commands .yohu-cm__list");
    expect(managerCss).toContain("var(--yohu-canvas)");
    expect(managerCss).not.toContain(".yohu-cm__table");
    expect(managerCss).not.toContain(".yohu-cm__cols");
  });

  it("发送/组编排在 store，View 不双轨、不写死 Comfortable", () => {
    expect(load("CommandTree.tsx")).toContain("enqueueGroup");
    expect(load("CommandTree.tsx")).not.toMatch(/if \(key\.startsWith\("g:"\)\) return;/);
    expect(load("TerminalView.tsx")).toContain("cancelGroup");
    expect(load("TerminalView.tsx")).not.toContain("fillTemplate");
    expect(load("Composer.tsx")).toContain("sendAll");
    expect(load("Composer.tsx")).toContain("YoChip");
    expect(load("Composer.tsx")).toContain("leading={queuedLeading(item)}");
    expect(load("Composer.tsx")).not.toContain("dismiss=");
    expect(load("Composer.tsx")).toContain("onDismiss");
    expect(load("Composer.tsx")).toContain("onDismiss");
    expect(load("Composer.tsx")).not.toContain("<textarea");
    expect(load("store.ts")).not.toContain("function runCommand");
    expect(load("store.ts")).toContain("onTaskSummary");
    expect(load("store.ts")).not.toContain("请逐条执行");
    expect(load("manager/GroupColumn.tsx")).toContain("controlRowHeight");
    expect(load("manager/EntryColumn.tsx")).toContain("controlRowHeight");
    expect(load("manager/GroupColumn.tsx")).not.toContain("Density.Comfortable");
    expect(load("manager/EntryColumn.tsx")).not.toContain("Density.Comfortable");
    expect(load("CommandManager.tsx")).toContain("errorText(e)");
    expect(load("CommandManager.tsx")).not.toContain("JSON.stringify(e)");
    expect(load("CommandManager.tsx")).toContain("MANAGER_DIALOG");
    expect(load("command-manager.css")).not.toContain("var(--yohu-z-overlay)");
    expect(load("command-manager.css")).not.toContain(".yohu-cm__step-grip");
    expect(load("command-manager.css")).not.toContain("position: absolute");
    expect(load("manager/BlockSteps.tsx")).not.toContain('"z-index": 1');
    expect(load("manager/TemplateField.tsx")).not.toContain("dataset.slotBound");
  });
});
