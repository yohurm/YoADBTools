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

const view = load("TerminalView.tsx");
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
    expect(view).toContain("data-open={composerOpen() ? \"true\" : \"false\"}");
    expect(view).toContain("chevron-right");
    expect(view).toContain("chevron-left");
    expect(view).not.toContain("yohu-recipe-xor");
    expect(view).not.toContain("YoCollapse");
    expect(view).not.toContain("Show when={!composerOpen()}");
    expect(css).toContain("container-type: inline-size");
    expect(css).toContain("border-start-start-radius");
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

  it("composer textarea 复用 TextField 壳类，模块 CSS 只留布局", () => {
    expect(view).toContain("<textarea");
    expect(view).toContain("yohu-text-field__control");
    expect(view).toContain("yohu-focus-host");
    expect(view).toContain("yohu-text-field__input");
    expect(view).toContain("yohu-terminal__composer-input");
    expect(view).toContain('data-paint="neutral"');
    expect(view).toContain('data-width="fill"');
    expect(view).not.toContain("YoTextArea");
    expect(view).toContain('class="yohu-text-field__input yohu-terminal__composer-input"');
    expect(view).not.toContain("yohu-terminal__composer-input yohu-focus-ring");

    const composerBlock = css.slice(css.indexOf(".yohu-terminal__composer-input"));
    const composerRule = composerBlock.slice(0, composerBlock.indexOf("}") + 1);
    expect(composerRule).toContain("resize: none");
    expect(composerRule).toContain("overflow: auto");
    expect(composerRule).toContain("var(--yohu-font-mono)");
    expect(composerRule).toContain("var(--yohu-control-height)");
    expect(composerRule).not.toMatch(/border(-radius|-color)?:/);
    expect(composerRule).not.toContain("background");
    expect(composerRule).not.toContain("border-color");
    expect(css).not.toContain(".yohu-terminal__composer-input:focus");
    expect(css).not.toContain(".yohu-terminal__composer-input:disabled");
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
  });

  it("流/排队认 data-first，命令管理走 Toolbar pad，不点内部根", () => {
    expect(css).toContain("[data-first]");
    expect(css).not.toContain(".yohu-presence");
    const manager = load("CommandManager.tsx");
    const managerCss = load("command-manager.css");
    expect(manager).toContain('pad="xs"');
    expect(managerCss).not.toContain(".yohu-toolbar");
  });
});
