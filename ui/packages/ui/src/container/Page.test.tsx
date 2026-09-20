import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoChrome } from "../chrome/chrome";
import { YoPage } from "./Page";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "page.css"), "utf8");

describe("YoPage", () => {
  it("页壳包住页眉，标题是第一子节点", () => {
    const { container } = render(() => (
      <YoPage class="yohu-mirror">
        <YoChrome title="投屏显示" />
        <div>内容</div>
      </YoPage>
    ));
    const page = container.querySelector(".yohu-page");
    expect(page).toBeTruthy();
    expect(page?.getAttribute("data-role")).toBe("module");
    expect(page?.hasAttribute("data-pad")).toBe(false);
    expect(page?.hasAttribute("data-column")).toBe(false);
    expect(page?.classList.contains("yohu-mirror")).toBe(true);
    expect(page?.querySelector(":scope > .yohu-chrome")).toBeTruthy();
    expect(page?.querySelector(".yohu-chrome__title")?.textContent).toBe("投屏显示");
  });

  it("设置页角色写 margin 垫与阅读列帽", () => {
    const { container } = render(() => (
      <YoPage role="settings" class="yohu-settings">
        <YoChrome title="设置" />
        <div>内容</div>
      </YoPage>
    ));
    const page = container.querySelector(".yohu-page");
    expect(page?.getAttribute("data-role")).toBe("settings");
    expect(page?.getAttribute("data-pad")).toBe("margin");
    expect(page?.getAttribute("data-column")).toBe("measure");
    expect(page?.classList.contains("yohu-settings")).toBe(true);
  });

  it("转发页根 ref 给快捷键宿主", () => {
    let root: HTMLDivElement | undefined;
    const { container } = render(() => (
      <YoPage class="yohu-logs" ref={(el) => { root = el; }}>
        <div>内容</div>
      </YoPage>
    ));
    expect(root).toBe(container.querySelector(".yohu-page"));
  });

  it("CSS：效率型 inset；设置页 page-margin + settings-max 居中", () => {
    expect(css).toContain("padding: var(--yohu-layout-page-inset)");
    expect(css).toMatch(/\[data-pad="margin"\]\s*\{[^}]*padding-inline:\s*var\(--yohu-layout-page-margin\)/);
    expect(css).toMatch(/\[data-column="measure"\]\s*\{[^}]*max-width:\s*var\(--yohu-layout-settings-max\)/);
    expect(css).toContain("margin-inline: auto");
    expect(css).not.toContain("grid-max");
  });
});
