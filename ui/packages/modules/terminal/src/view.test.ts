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
    expect(load("Composer.tsx")).not.toContain("YoCollapse");
    expect(view).not.toContain("Show when={!composerOpen()}");
    expect(css).toContain("container-type: inline-size");
    expect(load("Composer.tsx")).toContain("YoButton");
    expect(load("Composer.tsx")).toContain("block");
    expect(load("Composer.tsx")).not.toContain("<button");
    expect(load("Composer.tsx")).not.toContain("yohu-terminal__dock-toggle");
    expect(css).not.toContain(".yohu-terminal__dock-toggle");
    expect(css).not.toContain(".yohu-terminal__dock-chrome");
    expect(css).not.toContain("border-start-start-radius");
    expect(css).not.toContain("border-block-start");
    expect(css).not.toContain("border-inline-start");
  });

  it("模块 CSS 不自写 animation / keyframes / 产品滚轴", () => {
    const managerCss = load("command-manager.css");
    expect(css).not.toMatch(/animation\s*:/);
    expect(css).not.toMatch(/@keyframes/);
    expect(css).not.toMatch(/overflow:\s*auto/);
    expect(css).not.toMatch(/overflow-y:\s*auto/);
    expect(css).not.toMatch(/overflow:\s*scroll/);
    expect(managerCss).not.toMatch(/overflow:\s*auto/);
    expect(managerCss).not.toMatch(/overflow-y:\s*auto/);
    expect(managerCss).not.toMatch(/overflow:\s*scroll/);
  });

  it("有内容时发送图标挂 send-aim，空内容不朝上", () => {
    expect(view).toContain("yohu-recipe-send-aim");
    expect(view).toContain('data-armed={canSend() ? "true" : "false"}');
    expect(view).toContain('icon="send"');
    expect(css).not.toContain("rotate(");
  });

  it("左右分栏都走 YoPanel 栏标题，命令库宽走 sidebar token", () => {
    const terminalView = load("TerminalView.tsx");
    const library = load("LibraryPane.tsx");
    expect(library).toContain('title="命令库"');
    expect(terminalView).toContain('title="执行结果"');
    expect(terminalView).toContain("LibraryPane");
    expect(css).toContain("var(--yohu-layout-sidebar)");
    expect(css).not.toMatch(/grid-template-columns:\s*280px/);
  });

  it("命令库检索走 YoSearch，模块不自叠 Collapse / TextField", () => {
    const library = load("LibraryPane.tsx");
    expect(library).toContain("YoSearch");
    expect(library).toContain('slot="entry"');
    expect(library).toContain('slot="bar"');
    expect(library).toContain("filterLibraryGroups");
    expect(library).toContain('placeholder="搜索命令"');
    expect(library).not.toContain("YoIconButton");
    expect(library).not.toContain("YoCollapse");
    expect(library).not.toContain("YoTextField");
    expect(library).not.toContain("usedSlots");
    expect(css).not.toContain(".yohu-terminal__library-search");
    expect(load("search.ts")).toContain("searchDocuments");
    expect(load("search.ts")).toContain("expandSearchGroups");
    expect(load("CommandTree.tsx")).toContain("groups:");
    expect(load("CommandTree.tsx")).not.toContain("terminalStore.library.groups.map");
  });

  it("结果流与命令树走 YoScroller，钉底不读原生内容高", () => {
    expect(load("ResultStream.tsx")).toContain("YoScroller");
    expect(load("ResultStream.tsx")).toContain("scrollToEnd");
    expect(load("ResultStream.tsx")).not.toMatch(/\.\s*scrollHeight/);
    expect(load("LibraryPane.tsx")).toContain("YoScroller");
    expect(load("TerminalView.tsx")).toContain("YoScroller");
    expect(load("TerminalView.tsx")).toContain('overflow="hidden"');
    expect(load("manager/EditorColumn.tsx")).toContain("YoScroller");
    expect(load("manager/EditorColumn.tsx")).toContain("YoEmptyState");
    expect(load("manager/EditorColumn.tsx")).toContain("YoToolbar");
    expect(load("manager/EditorColumn.tsx")).toContain("YoSubheader");
    expect(load("manager/EditorColumn.tsx")).toContain("editorPaneTitle");
    expect(load("manager/EditorColumn.tsx")).not.toContain('overflow="auto"');
    expect(load("manager/EditorColumn.tsx")).not.toContain("yohu-cm__empty");
    expect(load("manager/EditorColumn.tsx")).not.toContain("title={editorPaneTitle");
    expect(load("manager/EditorColumn.tsx")).not.toMatch(/<YoToolbar[^>]*\stitle=/);
    expect(load("ParameterDialog.tsx")).toContain("YoScroller");
    expect(load("ParameterDialog.tsx")).not.toMatch(/\.\s*scrollHeight/);
    expect(load("CommandManager.tsx")).not.toContain("YoScroller");
    expect(load("manager/Workspace.tsx")).not.toContain("YoScroller");
  });

  it("composer 走 YoTextField multiline，不自挂 textarea 壳", () => {
    const composer = load("Composer.tsx");
    expect(composer).toContain("YoTextField");
    expect(composer).toContain("multiline");
    expect(composer).toContain('font="mono"');
    expect(composer).toContain("rows={1}");
    expect(composer).not.toContain("<textarea");
    expect(composer).not.toContain("YoTextArea");
    expect(composer).not.toContain("yohu-text-field__control");
    expect(composer).not.toContain("yohu-text-field__input");
    expect(composer).not.toContain("yohu-terminal__composer-input");
    expect(css).not.toContain(".yohu-terminal__composer-input");
    expect(css).not.toContain(".yohu-text-field");
    expect(css).toContain(".yohu-terminal__composer-field");
    expect(css).not.toContain(":is(input, textarea)");
    expect(css).not.toContain(".yohu-terminal__send .yohu-icon-button:disabled");
    expect(composer).not.toContain("YoTravel");
    expect(composer).not.toContain("YoGrow");
    expect(composer).not.toContain("maxRows");
    expect(css).toContain("align-items: flex-end");
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
    expect(params).toContain("YoScroller");
    expect(params).toContain("YoSubheader");
    expect(params).toContain("原始命令");
    expect(params).toContain("填写参数");
    expect(params).toContain("entryFillFields");
    expect(params).not.toContain("params-caption");
    expect(params).not.toContain("params-line");
    expect(params).not.toContain("预览");
    expect(params).not.toContain("previewFill");
    expect(params).not.toContain('querySelectorAll("input")');
    expect(load("manager/TemplateField.tsx")).toContain("插入参数");
    expect(load("manager/TemplateField.tsx")).not.toContain("插入 {");
    expect(load("manager/CommandEditor.tsx")).toContain("commandTemplateLabel");
    expect(load("manager/CommandEditor.tsx")).toContain("ParamDescriptions");
    expect(load("manager/CommandEditor.tsx")).toContain("TemplateField");
    expect(load("manager/BlockEditor.tsx")).toContain("BlockSteps");
    expect(load("manager/EditorColumn.tsx")).toContain("editorTarget");
    expect(load("manager/EditorColumn.tsx")).toContain("createMemo");
    expect(load("manager/EditorColumn.tsx")).not.toContain("entry.kind ===");
    expect(load("manager/EditorColumn.tsx")).not.toContain("<Switch");
    expect(load("manager/TemplateField.tsx")).toContain("insertPlaceholderAtDisplay");
    expect(load("manager/TemplateField.tsx")).not.toContain("onPlace");
    expect(load("manager/TemplateField.tsx")).not.toContain("usedSlots");
    expect(load("manager/TemplateField.tsx")).not.toContain("插入参数位置");
    expect(load("manager/store.ts")).toContain("updateBlockStepParams");
    expect(load("manager/store.ts")).not.toContain("placePlaceholder");
    expect(load("manager/store.ts")).not.toContain("entrySlots");
    expect(load("manager/CommandEditor.tsx")).toContain("placeholderSlots");
    expect(load("manager/CommandEditor.tsx")).not.toContain("entrySlots");
    expect(load("manager/BlockEditor.tsx")).not.toContain("ParamDescriptions");
    expect(load("manager/BlockEditor.tsx")).toContain("BlockSteps");
    expect(load("manager/BlockEditor.tsx")).not.toContain("templatesSlots");
    expect(load("manager/BlockSteps.tsx")).toContain("TemplateField");
    expect(load("manager/BlockSteps.tsx")).toContain("ParamDescriptions");
    expect(load("manager/BlockSteps.tsx")).toContain("stepParamLabel");
    expect(load("manager/BlockSteps.tsx")).not.toContain("placePlaceholder");
    expect(load("manager/BlockSteps.tsx")).not.toContain("templatesSlots");
    expect(load("manager/BlockSteps.tsx")).not.toContain("usedSlots");
    expect(load("manager/BlockSteps.tsx")).toContain("label={`步骤 ${stepNo()}`}");
    expect(load("manager/BlockSteps.tsx")).not.toContain("YoListPresence");
    expect(load("manager/BlockSteps.tsx")).not.toContain("YoPresence");
    expect(load("manager/ParamDescriptions.tsx")).toContain("YoListPresence");
    expect(load("manager/ParamDescriptions.tsx")).toContain('recipe="list"');
    expect(load("manager/ParamDescriptions.tsx")).not.toContain("<For");
    expect(load("manager/ParamDescriptions.tsx")).not.toContain("<Show");
    expect(managerCss).toContain(".yohu-cm__param-descs:not(:has(.yohu-presence))");
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
      load("manager/Workspace.tsx"),
      load("manager/GroupColumn.tsx"),
      load("manager/EntryColumn.tsx"),
      load("manager/EditorColumn.tsx"),
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
    expect(load("manager/GroupColumn.tsx")).toContain('title="命令组"');
    expect(load("manager/EntryColumn.tsx")).toContain('title="条目"');
    expect(load("manager/GroupColumn.tsx")).not.toMatch(/<YoToolbar[^>]*\stitle=/);
    expect(load("manager/EntryColumn.tsx")).not.toMatch(/<YoToolbar[^>]*\stitle=/);
    expect(load("manager/EntryColumn.tsx")).toContain('tone="list"');
    expect(load("manager/EntryColumn.tsx")).toContain('icon="block"');
    expect(load("manager/EntryColumn.tsx")).toContain('title="新增命令块"');
    expect(load("manager/EntryColumn.tsx")).not.toContain('icon="list"');
    expect(load("CommandTree.tsx")).toContain('icon: "block"');
    expect(load("CommandTree.tsx")).not.toContain('icon: "list"');
    expect(load("Composer.tsx")).toContain('return "block"');
    expect(load("manager/BlockSteps.tsx")).toContain("YoSubheader");
    expect(load("manager/BlockSteps.tsx")).not.toContain("yohu-cm__caption");
    expect(load("CommandManager.tsx")).toContain("YoBadge");
    expect(load("manager/ParamDescriptions.tsx")).toContain("YoSubheader");
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColFrame");
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColTrack");
    expect(load("manager/EditorColumn.tsx")).toContain('variant="pane"');
    expect(load("manager/EditorColumn.tsx")).not.toContain("<div class=\"yohu-cm__editor\"");
    expect(manager).toContain("pointerSelectMode");
    expect(manager).toContain("attachPanelKeys");
    expect(manager).toContain("createEffect");
    expect(manager).toContain("store.ui.open");
    expect(load("manager/Workspace.tsx")).toContain("onCleanup(stop)");
    expect(load("CommandManager.tsx")).toContain("toaster.destroy()");
    expect(load("CommandManager.tsx")).not.toContain("onMount");
    expect(manager).toContain("COMMAND_MANAGER_KEY_BINDINGS");
    expect(manager).toContain("openContextMenu");
    expect(manager).toContain("terminalCommandMenu");
    expect(manager).toContain("ManagerWorkspace");
    expect(manager).not.toContain("<YoContextMenu");
    expect(manager).not.toContain("<ul");
    expect(manager).not.toContain("<li");
    expect(load("CommandManager.tsx")).not.toContain("querySelectorAll");
    expect(load("CommandManager.tsx")).not.toContain("createStore");
    expect(load("CommandManager.tsx")).not.toContain("attachPanelKeys");
    expect(load("manager/Workspace.tsx")).toContain("attachPanelKeys");
    expect(load("manager/Workspace.tsx")).toContain("onCleanup(stop)");
    const managerStore = load("manager/store.ts");
    expect(managerStore).not.toMatch(/from ["']\.\.\/store["']/);
    expect(managerStore).not.toContain("openContextMenu");
    expect(managerStore).not.toContain("clipboard");
    expect(managerStore).not.toContain("querySelector");
    expect(managerCss).not.toContain(".yohu-toolbar");
    expect(managerCss).not.toContain(".yohu-panel");
    expect(managerCss).toContain(".yohu-cm__commands .yohu-cm__list");
    expect(managerCss).toContain("grid-template-rows: minmax(0, 1fr)");
    expect(managerCss).toContain("var(--yohu-canvas)");
    expect(managerCss).not.toContain(".yohu-cm__table");
    expect(managerCss).not.toContain(".yohu-cm__cols");
  });

  it("参数 Dialog 常挂，关窗只翻 open，出场完成再卸 entry", () => {
    const terminalView = load("TerminalView.tsx");
    const params = load("ParameterDialog.tsx");
    expect(terminalView).not.toContain("<Show when={inputEntry()}");
    expect(terminalView).toContain("open={inputOpen}");
    expect(terminalView).toContain("onExitComplete");
    expect(terminalView).toContain("setInputEntry(null)");
    expect(terminalView).toContain("setInputOpen(false)");
    const onCloseBlock = terminalView.slice(
      terminalView.indexOf("onClose={() => {"),
      terminalView.indexOf("onExitComplete"),
    );
    expect(onCloseBlock).toContain("setInputOpen(false)");
    expect(onCloseBlock).not.toContain("setInputEntry");
    const onSubmitBlock = terminalView.slice(terminalView.indexOf("onSubmit={(values)"));
    expect(onSubmitBlock).toContain("setInputOpen(false)");
    expect(onSubmitBlock).not.toContain("setInputEntry");
    expect(params).toContain("onExitComplete={props.onExitComplete}");
    expect(params).toContain("props.onClose()");
    expect(params).toContain("createEffect((wasOpen");
    expect(params).toContain("!wasOpen && now");
    expect(params).not.toContain("if (props.open())");
  });

  it("命令管理关窗不抽空草稿，Toaster 挂回树", () => {
    const manager = load("CommandManager.tsx");
    const managerStore = load("manager/store.ts");
    expect(manager).toContain("YoToaster");
    expect(manager).toContain("toaster={toaster}");
    expect(manager).toContain("onExitComplete");
    expect(manager).toContain("store.finishClose()");
    expect(manager).toContain("store.requestClose()");
    expect(manager).not.toContain("store.close()");
    expect(manager).not.toContain("Toast.success");
    expect(manager).toContain("toaster.destroy()");
    expect(manager).toContain("onCleanup(() => toaster.destroy())");
    expect(managerStore).toContain("function requestClose");
    expect(managerStore).toContain("function finishClose");
    expect(managerStore).not.toContain("function close(");
    const requestCloseBlock = managerStore.slice(
      managerStore.indexOf("function requestClose"),
      managerStore.indexOf("function finishClose"),
    );
    expect(requestCloseBlock).toContain('setUi("open", false)');
    expect(requestCloseBlock).not.toContain("setDraft");
    expect(requestCloseBlock).not.toContain("groups: []");
  });

  it("发送/组编排在 store，View 不双轨、不写死 Comfortable", () => {
    expect(load("CommandTree.tsx")).not.toContain("enqueueGroup");
    expect(load("CommandTree.tsx")).toContain("if (isGroup(node.data)) return;");
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
    expect(load("CommandManager.tsx")).toContain("commandManagerStore");
    expect(load("CommandManager.tsx")).not.toContain("createCommandManagerStore");
    expect(load("CommandManager.tsx")).not.toContain("open && !wasOpen");
    expect(load("TerminalView.tsx")).toContain("commandManagerStore.open");
    expect(load("TerminalView.tsx")).not.toContain("setManagerOpen");
    expect(load("manager/store.ts")).toContain("export const commandManagerStore");
    expect(load("command-manager.css")).not.toContain("var(--yohu-z-overlay)");
    expect(load("command-manager.css")).not.toContain(".yohu-cm__step-grip");
    expect(load("command-manager.css")).not.toContain("position: absolute");
    expect(load("manager/BlockSteps.tsx")).not.toContain('"z-index": 1');
    expect(load("manager/TemplateField.tsx")).not.toContain("dataset.slotBound");
  });
});
