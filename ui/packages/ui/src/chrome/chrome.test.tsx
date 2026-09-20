import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSignal } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import { YoChrome } from "./chrome";

function loadChromeCss(): string {
  const candidates = [
    resolve(process.cwd(), "src/chrome/chrome.css"),
    resolve(process.cwd(), "packages/ui/src/chrome/chrome.css"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
  }
  return "";
}

describe("YoChrome", () => {
  it("dropIgnore 标记页眉不当投放目标", () => {
    const { container } = render(() => <YoChrome title="文件管理" dropIgnore />);
    expect(container.querySelector(".yohu-chrome")?.getAttribute("data-drop")).toBe("ignore");
  });

  it("在原地渲染标题区与功能栏，不传送", () => {
    const { container } = render(() => (
      <div data-testid="body">
        <YoChrome title="命令终端" leading={<span>A1</span>} actions={[{ key: "run", node: <button type="button">执行</button> }]} />
      </div>
    ));
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("命令终端");
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toContain("A1");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("执行");
    expect(screen.getByTestId("body").querySelector(".yohu-chrome")).toBeTruthy();
  });

  it("leading 落在标题后设备槽", () => {
    const { container } = render(() => <YoChrome title="文件管理" leading={<span>Moto X</span>} />);
    expect(container.querySelector(".yohu-chrome__heading")?.textContent).toBe("文件管理");
    expect(container.querySelector(".yohu-chrome__leading")?.textContent).toBe("Moto X");
  });

  it("无 leading 时不渲染设备槽", () => {
    const { container } = render(() => <YoChrome title="设置" />);
    expect(container.querySelector(".yohu-chrome__leading")).toBeNull();
  });

  it("无操作时只显示标题区", () => {
    const { container } = render(() => <YoChrome title="投屏显示" />);
    expect(container.querySelector(".yohu-chrome")?.hasAttribute("data-layout")).toBe(false);
    expect(container.querySelector(".yohu-chrome__heading")?.textContent).toBe("投屏显示");
    expect(container.querySelector(".yohu-chrome__title")?.textContent).toBe("投屏显示");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toBe("");
    expect(container.querySelector(".yohu-chrome__bar button")).toBeNull();
    expect(container.querySelector(".yohu-chrome__row")).toBeTruthy();
  });

  it("标题行占位走 control-height，底垫走 chrome-pad（外壳不加 min-height）", () => {
    const css = loadChromeCss();
    expect(css.length).toBeGreaterThan(0);
    expect(css).toMatch(
      /\.yohu-chrome__title\s*\{[^}]*min-height:\s*var\(--yohu-control-height\)/,
    );
    expect(css).toMatch(/padding-bottom:\s*var\(--yohu-layout-chrome-pad\)/);
    expect(css).toContain(".yohu-chrome__heading");
    expect(css).not.toContain(".yohu-module-title");
    const chromeBlock = css.match(/\.yohu-chrome\s*\{[^}]+\}/)?.[0] ?? "";
    expect(chromeBlock).not.toMatch(/min-height/);
    expect(chromeBlock).not.toMatch(/border-bottom/);
    expect(chromeBlock).not.toContain("data-layout");
  });

  it("extra 落在次行，不进主行功能栏", () => {
    const { container } = render(() => (
      <YoChrome title="投屏显示" extra={<span>质量</span>} actions={[{ key: "start", node: <button type="button">开始</button> }]} />
    ));
    expect(container.querySelector(".yohu-chrome")?.hasAttribute("data-layout")).toBe(false);
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("开始");
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).not.toContain("质量");
    expect(container.querySelector(".yohu-chrome__extra")?.textContent).toContain("质量");
  });

  it("leading 与功能栏走 Presence chip，不用 Show 直切", () => {
    const src = readFileSync(
      existsSync(resolve(process.cwd(), "src/chrome/chrome.tsx"))
        ? resolve(process.cwd(), "src/chrome/chrome.tsx")
        : resolve(process.cwd(), "packages/ui/src/chrome/chrome.tsx"),
      "utf-8",
    );
    expect(src).toContain("YoPresence");
    expect(src).toContain("YoListPresence");
    expect(src).toContain('recipe="chip"');
    expect(src).toContain("slots().showLeading");
    expect(src).not.toContain("chromeHasBar");
    expect(src).not.toContain('from "./chrome-model"');
    expect(src).not.toMatch(/<Show when=\{slots\(\)\.showBar\}>/);
    expect(src).not.toContain("children?");
    expect(src).not.toContain("props.children");
  });

  it("功能栏清空时 ListPresence 仍在树上收 each=[]", () => {
    const [actions, setActions] = createSignal([{ key: "run", node: <button type="button">执行</button> }]);
    const { container } = render(() => <YoChrome title="命令终端" actions={actions()} />);
    expect(container.querySelector(".yohu-chrome__bar")?.textContent).toContain("执行");
    setActions([]);
    expect(container.querySelector(".yohu-chrome__bar")).toBeTruthy();
    expect(container.querySelector(".yohu-chrome__bar button")).toBeNull();
  });
});
