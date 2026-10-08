import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
    expect(load("Composer.tsx")).toContain('data-part="clip"');
    expect(load("Composer.tsx")).toContain('data-part="pane"');
    expect(load("Composer.tsx")).toContain('data-part="toggle"');
    expect(view).toContain("data-open={flagAttr(open())}");
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
    expect(view).toContain("data-armed={flagAttr(canSend())}");
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
    expect(library).toContain("placeholder={librarySearchPrompt()}");
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
    expect(load("ResultStream.tsx")).toContain("ioLineIsIn");
    expect(load("ResultStream.tsx")).not.toContain('kind === "in"');
    expect(load("ResultStream.tsx")).not.toContain('kind === "out"');
    expect(load("store.ts")).toContain('return kind === "in"');
    expect(load("ResultStream.tsx")).not.toMatch(/\.\s*scrollHeight/);
    expect(load("LibraryPane.tsx")).toContain("YoScroller");
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
    expect(managerCss).toContain(".yohu-cm__param-descs:not(:has(*))");
    expect(managerCss).not.toContain(".yohu-presence");
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
    expect(manager).toContain("opsListBindings");
    expect(manager).toContain("YoVirtualList");
    expect(manager).not.toContain("YoOpsList");
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
    expect(load("manager/GroupColumn.tsx")).toContain("title={groupColumnLabel()}");
    expect(load("manager/EntryColumn.tsx")).toContain("title={entryColumnLabel()}");
    expect(load("manager/GroupColumn.tsx")).not.toMatch(/<YoToolbar[^>]*\stitle=/);
    expect(load("manager/EntryColumn.tsx")).not.toMatch(/<YoToolbar[^>]*\stitle=/);
    expect(load("manager/EntryColumn.tsx")).not.toContain('tone="list"');
    expect(load("manager/EntryColumn.tsx")).toContain('"rule"');
    expect(load("manager/EntryColumn.tsx")).toContain('icon="block"');
    expect(load("manager/EntryColumn.tsx")).toContain('title="新增命令块"');
    expect(load("manager/EntryColumn.tsx")).not.toContain('icon="list"');
    expect(load("CommandTree.tsx")).toContain("libraryEntryIcon");
    expect(load("CommandTree.tsx")).not.toContain('icon: "list"');
    expect(load("CommandTree.tsx")).not.toContain('icon: "block"');
    expect(load("Composer.tsx")).toContain('return "block"');
    expect(load("Composer.tsx")).toContain("IconName");
    expect(load("Composer.tsx")).not.toContain('"terminal" | "block"');
    expect(load("manager/BlockSteps.tsx")).toContain("YoSubheader");
    expect(load("manager/BlockSteps.tsx")).not.toContain("yohu-cm__caption");
    expect(load("CommandManager.tsx")).toContain("YoBadge");
    expect(load("manager/ParamDescriptions.tsx")).toContain("YoSubheader");
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColFrame");
    expect(load("manager/EntryColumn.tsx")).not.toContain("YoColTrack");
    expect(load("manager/EditorColumn.tsx")).toContain('variant="pane"');
    expect(load("manager/EditorColumn.tsx")).not.toContain('class="yohu-cm__editor"');
    expect(load("manager/GroupColumn.tsx")).not.toContain("yohu-cm__groups");
    expect(load("manager/EntryColumn.tsx")).not.toContain("yohu-cm__commands");
    expect(managerCss).not.toContain(".yohu-cm__groups");
    expect(managerCss).not.toContain(".yohu-cm__commands");
    expect(managerCss).not.toContain(".yohu-cm__editor {");
    expect(manager).toContain("pointerSelectMode");
    expect(manager).toContain("attachPanelKeys");
    expect(manager).toContain("createEffect");
    expect(manager).toContain("store.ui.open");
    expect(load("manager/Workspace.tsx")).toContain("onCleanup(stop)");
    expect(load("CommandManager.tsx")).toContain("toaster.destroy()");
    expect(load("CommandManager.tsx")).not.toContain("onMount");
    expect(manager).toContain("COMMAND_MANAGER_KEY_BINDINGS");
    expect(load("manager/keys.ts")).toContain('".yohu-cm__list"');
    expect(load("manager/keys.ts")).not.toContain(".yohu-virtual-list");
    expect(load("manager/GroupColumn.tsx")).toContain('class="yohu-cm__list"');
    expect(load("manager/EntryColumn.tsx")).toContain('class="yohu-cm__list"');
    expect(managerCss).not.toContain(".yohu-cm__list");
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
    expect(load("manager/GroupColumn.tsx")).toContain('role="ops"');
    expect(load("manager/EntryColumn.tsx")).toContain('role="ops"');
    expect(load("manager/GroupColumn.tsx")).toContain('features: ["select", "reorder"]');
    expect(load("manager/EntryColumn.tsx")).toContain('features: ["multi", "reorder", "menu", "rule"]');
    expect(load("manager/GroupColumn.tsx")).toContain("YoOpsItem");
    expect(load("manager/EntryColumn.tsx")).toContain("YoOpsItem");
    expect(load("manager/GroupColumn.tsx")).toContain("draftRowTitle");
    expect(load("manager/EntryColumn.tsx")).toContain("draftRowTitle");
    expect(load("manager/GroupColumn.tsx")).not.toContain("（未命名）");
    expect(load("manager/EntryColumn.tsx")).not.toContain("（未命名）");
    expect(load("manager/EditorColumn.tsx")).not.toContain('role="ops"');
    expect(managerCss).not.toContain(".yohu-cm__row");
    expect(managerCss).not.toContain("var(--yohu-canvas)");
    expect(load("manager/GroupColumn.tsx")).toContain("opsListBindings");
    expect(load("manager/EntryColumn.tsx")).toContain("opsListBindings");
    expect(managerCss).toContain("grid-template-rows: minmax(0, 1fr)");
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
    expect(onCloseBlock).toContain("closeParameter()");
    expect(onCloseBlock).not.toContain("setInputEntry");
    const onSubmitBlock = terminalView.slice(terminalView.indexOf("onSubmit={(values)"));
    expect(onSubmitBlock).toContain("closeParameter()");
    expect(onSubmitBlock).not.toContain("setInputEntry");
    expect(params).toContain("onExitComplete={props.onExitComplete}");
    expect(params).toContain("props.onClose()");
    expect(params).toContain("createEffect((wasOpen");
    expect(params).toContain("!wasOpen && now");
    expect(params).toContain("resolveDialogOpen(props.open)");
    expect(params).not.toContain("props.open()");
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
    expect(load("store.ts")).not.toContain("enqueueGroup");
    expect(load("CommandTree.tsx")).toContain("if (isGroup(node.data)) return;");
    expect(load("TerminalView.tsx")).toContain("cancelGroup");
    expect(load("TerminalView.tsx")).not.toContain("fillTemplate");
    expect(load("Composer.tsx")).toContain("sendAll");
    expect(load("Composer.tsx")).toContain("YoChip");
    expect(load("Composer.tsx")).toContain("leading={queuedLeading(item)}");
    expect(load("Composer.tsx")).not.toContain("dismiss=");
    expect(load("Composer.tsx")).toContain("onDismiss");
    expect(load("Composer.tsx")).not.toContain("DismissMark");
    expect(load("Composer.tsx")).not.toContain("yohu-recipe-dismiss");
    expect(css).not.toContain("yohu-recipe-dismiss");
    expect(css).not.toContain("yohu-chip__remove");
    expect(load("Composer.tsx")).not.toContain("<textarea");
    expect(load("store.ts")).not.toContain("function runCommand");
    expect(load("store.ts")).toContain("onTaskSummary");
    expect(load("store.ts")).not.toContain("请逐条执行");
    expect(load("manager/GroupColumn.tsx")).toContain("controlRowHeight");
    expect(load("manager/EntryColumn.tsx")).toContain("controlRowHeight");
    expect(load("manager/GroupColumn.tsx")).not.toContain('from "../layout"');
    expect(load("manager/EntryColumn.tsx")).not.toContain('from "../layout"');
    expect(load("layout.ts")).not.toContain("function controlRowHeight");
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
    const managerCss = load("command-manager.css");
    const withoutFlight = managerCss.replace(/\.yohu-cm-migrate \{[^}]*\}/, "");
    expect(withoutFlight).not.toContain("position: absolute");
    expect(managerCss).toContain(".yohu-cm-migrate {");
    expect(load("manager/BlockSteps.tsx")).not.toContain('"z-index": 1');
    expect(load("manager/TemplateField.tsx")).not.toContain("dataset.slotBound");
  });
});

describe("命令库拖入导入", () => {
  it("命令库栏复用面板虚线，不引用文件模块", () => {
    const pane = load("LibraryPane.tsx");
    const drop = load("library-drop.ts");
    const dialog = load("ImportDialog.tsx");
    const view = load("TerminalView.tsx");
    expect(pane).toContain("edge={panelHotEdge(drop.hot())}");
    const dropEdge = '? "drop" : undefined';
    const terminalRoot = dirname(fileURLToPath(import.meta.url));
    const dropEdgeOffenders = terminalSources(terminalRoot).filter((file) => {
      let text = readFileSync(file, "utf8");
      if (file.includes(".test.")) text = text.replaceAll(dropEdge, "");
      return text.includes(dropEdge);
    });
    expect(dropEdgeOffenders).toEqual([]);
    expect(pane).toContain("createLibraryDrop");
    expect(pane).not.toContain("@yohu/module-files");
    expect(drop).toContain("bindNativeDragDrop");
    expect(drop).toContain("NATIVE_DRAG_SUBSCRIBE_FAILED");
    expect(drop).not.toContain("订阅官方拖放失败");
    expect(drop).toContain("hostPixelRatio()");
    expect(drop).not.toContain("window.devicePixelRatio");
    expect(drop).not.toContain("module-files");
    expect(drop).not.toContain("destDirFromEntries");
    expect(dialog).toContain("resolveDialogOpen(props.open)");
    expect(dialog).not.toContain("props.open()");
    expect(dialog).toContain('title="导入命令"');
    expect(dialog).toContain("YoCheckbox");
    expect(dialog).toContain("YoBadge");
    expect(dialog).toContain("IMPORT_ALREADY_IN_LIBRARY");
    expect(dialog).not.toContain('text="已在库中"');
    expect(dialog).toContain('label="全选"');
    expect(dialog).toContain("YoScroller");
    expect(dialog).toContain("importDialogSize");
    expect(dialog).toContain('data-role="section"');
    expect(dialog).toContain('data-role="entry"');
    expect(dialog).toMatch(/<YoCheckbox\s+block/);
    expect(dialog).not.toContain("yohu-terminal__import-check");
    expect(css).not.toContain(".yohu-checkbox");
    expect(css).not.toContain("yohu-terminal__import-check");
    expect(dialog).toContain('tone="section"');
    expect(dialog).toContain("importConfirmLabel");
    expect(dialog).toContain("libraryEntryIcon");
    expect(dialog).not.toContain('entry.kind === "block"');
    expect(view).not.toContain("commandlibPreview");
    expect(view).not.toContain("commandlibApply");
    expect(view).not.toContain("importPathReject");
    expect(drop).not.toContain("importPathReject");
    expect(load("store.ts")).toContain("commandlibPreview");
    expect(load("store.ts")).toContain("commandlibApply");
    expect(view).toContain("commandManagerStore.ui.open");
    expect(view).not.toContain("@yohu/module-files");
    expect(load("draft.ts")).not.toContain("import-selection");
  });

  it("命令库树键只拼一次", () => {
    const keys = load("library-expand.ts");
    expect(keys.split('"g:"').length - 1).toBe(1);
    const tree = load("CommandTree.tsx")
      .replace("return `c:${id}`", "")
      .replace("return `b:${id}`", "");
    expect(tree).not.toContain("`g:${");
    expect(tree).not.toContain('"g:"');
    expect(tree).not.toContain("`c:${");
    expect(tree).not.toContain("`b:${");
    expect(tree).not.toContain("defaultExpandedKeys");
    expect(load("LibraryPane.tsx")).not.toContain("`g:${");
    expect(load("LibraryPane.tsx")).not.toContain('"g:"');
    expect(load("LibraryPane.tsx")).toContain("libraryGroupKey");
    expect(load("LibraryPane.tsx")).toContain("nextLibraryOpenIds");
    expect(load("LibraryPane.tsx")).toContain("if (searching()) return");
    expect(load("TerminalView.tsx")).toContain("terminal_library_expand");
  });

  it("组节点的 kind 只在 isGroup 里看", () => {
    const tree = load("CommandTree.tsx").replace('!("kind" in data)', "");
    expect(tree).not.toContain('"kind" in');
  });
});

/** 开着省略、关掉写成 true。先从本文件剥掉这些针，再扫。 */
const CLOSED_ATTR_NEEDLES = [
  "!open() || undefined",
  "!open() ? true : undefined",
  "open() || undefined",
  "open() ? true : undefined",
];

function terminalSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...terminalSources(path));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

function withoutClosedNeedles(text: string): string {
  let out = text;
  for (const needle of CLOSED_ATTR_NEEDLES) out = out.replaceAll(needle, "");
  return out;
}

describe("关掉写成 true", () => {
  it("生产源只调 closedAttr，不再手写开合省略", () => {
    const composer = load("Composer.tsx");
    expect(composer.match(/closedAttr\(!open\(\)\)/g)?.length ?? 0).toBe(2);
    expect(composer.match(/closedAttr\(open\(\)\)/g)?.length ?? 0).toBe(2);
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = terminalSources(root).filter((file) => {
      let text = readFileSync(file, "utf8");
      if (file.includes(".test.")) text = withoutClosedNeedles(text);
      return CLOSED_ATTR_NEEDLES.some((needle) => text.includes(needle));
    });
    expect(offenders).toEqual([]);
  });
});

const FLAG_ATTR_NEEDLE = '? "true" : "false"';

describe("真假旗", () => {
  it("生产源只调 flagAttr，不再手写 true/false", () => {
    const composer = load("Composer.tsx");
    expect(composer).toContain("data-open={flagAttr(open())}");
    expect(composer).toContain("data-armed={flagAttr(canSend())}");
    const root = dirname(fileURLToPath(import.meta.url));
    const offenders = terminalSources(root).filter((file) => {
      let text = readFileSync(file, "utf8");
      if (file.includes(".test.")) text = text.replaceAll(FLAG_ATTR_NEEDLE, "");
      return text.includes(FLAG_ATTR_NEEDLE);
    });
    expect(offenders).toEqual([]);
  });
});

describe("要不要填参", () => {
  it("个数大于零只留在 countNeedsInput", () => {
    const line = load("command-line.ts").replace("return count > 0", "");
    expect(line).toContain("function countNeedsInput");
    expect(line).not.toContain("placeholderArity(template) > 0");
    expect(line).not.toContain("entryArity(entry) > 0");
  });
});

describe("模板字段选区", () => {
  it("同一元素同一回调的摘挂只登记一处", () => {
    const source = load("manager/TemplateField.tsx");
    expect(source.split("el.add" + "EventListener").length - 1).toBe(1);
    expect(source.split("el.remove" + "EventListener").length - 1).toBe(1);
    expect(source).toContain("listen(");
  });
});

describe("搜索命令只写一句", () => {
  it("library_search_prompt_once", () => {
    const src = load("LibraryPane.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "搜索命令" + '"')).toBe(1);
    expect(times("function librarySearchPrompt")).toBe(1);
    expect(times("export function librarySearchPrompt")).toBe(0);
    expect(times("librarySearchPrompt()")).toBe(4);
  });
});

describe("原始命令只写一句", () => {
  it("original_command_label_once", () => {
    const src = load("ParameterDialog.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "原始命令" + '"')).toBe(1);
    expect(times("function originalCommandLabel")).toBe(1);
    expect(times("export function originalCommandLabel")).toBe(0);
    expect(times("originalCommandLabel()")).toBe(3);
  });
});

describe("参数描述只写一句", () => {
  it("param_description_copy_once", () => {
    const src = load("manager/ParamDescriptions.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "参数描述" + '"')).toBe(1);
    expect(times("function paramDescriptionCopy")).toBe(1);
    expect(times("export function paramDescriptionCopy")).toBe(0);
    expect(times("paramDescriptionCopy()")).toBe(4);
  });
});

describe("命令组栏名字只写一句", () => {
  it("group_column_label_once", () => {
    const src = load("manager/GroupColumn.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "命令组" + '"')).toBe(1);
    expect(times("function groupColumnLabel")).toBe(1);
    expect(times("export function groupColumnLabel")).toBe(0);
    expect(times("groupColumnLabel()")).toBe(3);
  });
});

describe("条目栏名字只写一句", () => {
  it("entry_column_label_once", () => {
    const src = load("manager/EntryColumn.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "条目" + '"')).toBe(1);
    expect(times("function entryColumnLabel")).toBe(1);
    expect(times("export function entryColumnLabel")).toBe(0);
    expect(times("entryColumnLabel()")).toBe(3);
  });
});

describe("步骤名单名字只写一句", () => {
  it("step_list_label_once", () => {
    const src = load("manager/BlockSteps.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times('"' + "步骤" + '"')).toBe(1);
    expect(times("function stepListLabel")).toBe(1);
    expect(times("export function stepListLabel")).toBe(0);
    expect(times("stepListLabel()")).toBe(3);
  });
});

describe("导入对话框尺寸只取一次", () => {
  it("import_dialog_box_once", () => {
    const src = load("ImportDialog.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("importDialog" + "Size()")).toBe(1);
    expect(times("function importDialogBox")).toBe(1);
    expect(times("export function importDialogBox")).toBe(0);
    expect(times("const box = importDialogBox()")).toBe(1);
  });
});

describe("导入不再进行中只写一次", () => {
  it("clear_busy_once", () => {
    const src = load("ImportDialog.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("setBusy(" + "false)")).toBe(1);
    expect(times("function clearBusy")).toBe(1);
    expect(times("export function clearBusy")).toBe(0);
    expect(times("clearBusy()")).toBe(3);
  });
});

describe("填参当前条目只读一次", () => {
  it("current_entry_once", () => {
    const src = load("TerminalView.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("input" + "Entry()")).toBe(1);
    expect(times("function currentEntry")).toBe(1);
    expect(times("export function currentEntry")).toBe(0);
    expect(times("currentEntry()")).toBe(3);
  });
});

describe("关上填参只写一次", () => {
  it("close_parameter_once", () => {
    const src = load("TerminalView.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("setInputOpen(" + "false)")).toBe(1);
    expect(times("function closeParameter")).toBe(1);
    expect(times("export function closeParameter")).toBe(0);
    expect(times("closeParameter()")).toBe(3);
  });
});

describe("发送栏发送只转发一次", () => {
  it("send_composer_once", () => {
    const src = load("Composer.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("terminalStore.sendAll(" + "props.serials)")).toBe(1);
    expect(times("function sendComposer")).toBe(1);
    expect(times("export function sendComposer")).toBe(0);
    expect(src).toContain("sendComposer()");
    expect(src).toContain("onClick={sendComposer}");
  });
});

describe("树节点条目标签只写一次", () => {
  it("entry_node_label_once", () => {
    const src = load("CommandTree.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("label: " + "entry.name")).toBe(1);
    expect(times("function entryNodeLabel")).toBe(1);
    expect(times("export function entryNodeLabel")).toBe(0);
    expect(times("...entryNodeLabel(entry)")).toBe(2);
  });
});

describe("树节点条目数据只写一次", () => {
  it("entry_node_data_once", () => {
    const src = load("CommandTree.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("data: " + "entry")).toBe(1);
    expect(times("function entryNodeData")).toBe(1);
    expect(times("export function entryNodeData")).toBe(0);
    expect(times("...entryNodeData(entry)")).toBe(2);
  });
});

describe("钉底下一帧只登记一次", () => {
  it("schedule_pin_once", () => {
    const src = load("ResultStream.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("window.requestAnimationFrame(" + "tick)")).toBe(1);
    expect(times("function schedulePin")).toBe(1);
    expect(times("export function schedulePin")).toBe(0);
    expect(times("schedulePin(tick)")).toBe(2);
  });
});

describe("模板控件只读一次", () => {
  it("field_el_once", () => {
    const src = load("manager/TemplateField.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("return " + "input()")).toBe(1);
    expect(times("function fieldEl")).toBe(1);
    expect(times("export function fieldEl")).toBe(0);
    expect(times("const el = fieldEl()")).toBe(2);
  });
});

describe("光标收成同一选区只写一次", () => {
  it("caret_span_once", () => {
    const src = load("manager/TemplateField.tsx");
    const times = (needle: string) => src.split(needle).length - 1;
    expect(times("start: caret, " + "end: caret")).toBe(1);
    expect(times("next.caret, " + "next.caret")).toBe(0);
    expect(times("function caretSpan")).toBe(1);
    expect(times("export function caretSpan")).toBe(0);
    expect(times("caretSpan(next.caret)")).toBe(1);
  });
});
