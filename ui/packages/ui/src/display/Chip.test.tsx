import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoChip } from "./Chip";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "Chip.css"), "utf8");
const src = readFileSync(resolve(here, "Chip.tsx"), "utf8");

describe("YoChip", () => {
  it("铬只 paint，圆钮与文案是宿主子级", () => {
    const onDismiss = vi.fn();
    const { container } = render(() => <YoChip text="HfLooper" onDismiss={onDismiss} />);
    const host = container.querySelector(".yohu-chip");
    const chrome = host?.querySelector(".yohu-chip__chrome");
    const remove = screen.getByRole("button", { name: "移除 HfLooper" });
    expect(host?.getAttribute("data-tone")).toBe("accent");
    expect(host?.hasAttribute("data-dismiss")).toBe(true);
    expect(host?.getAttribute("title")).toBeNull();
    expect(chrome?.getAttribute("data-mode")).toBe("paint");
    expect(chrome?.parentElement).toBe(host);
    expect(remove.parentElement).toBe(host);
    expect(remove.querySelector(".yohu-icon")).toBeTruthy();
    expect(remove.hasAttribute("data-dialog-skip")).toBe(false);
    fireEvent.click(remove);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(src).toContain('mode="paint"');
    expect(src).not.toContain("clip=");
    expect(css).not.toContain("yohu-corner__content");
  });

  it("block 铺满父格，文案吃中间、关闭贴盒尾", () => {
    const { container } = render(() => <YoChip text="app.apk" block onDismiss={() => undefined} />);
    expect(container.querySelector(".yohu-chip")?.hasAttribute("data-block")).toBe(true);
    expect(css).toContain(".yohu-chip[data-block]");
    const blockLabel = css.slice(css.indexOf(".yohu-chip[data-block] .yohu-chip__label"));
    expect(blockLabel.slice(0, blockLabel.indexOf("}") + 1)).toContain("flex: 1 1 auto");
  });

  it("无 onDismiss 不画删除", () => {
    render(() => <YoChip text="libc" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("leading 流内前导", () => {
    const { container } = render(() => (
      <YoChip text="app.apk" leading="folder" onDismiss={() => undefined} />
    ));
    const host = container.querySelector(".yohu-chip");
    expect(host?.getAttribute("data-leading")).toBe("true");
    expect(host?.querySelector(".yohu-chip__leading [data-icon='folder']")).toBeTruthy();
  });

  it("没有 hover 藏钮，也没有 YoChipDismiss", () => {
    expect(src).not.toContain("YoChipDismiss");
    expect(src).not.toContain("data-dialog-skip");
    expect(src).not.toContain("dismiss?");
    expect(src).not.toContain('dismiss="hover"');
    expect(css).not.toContain("opacity: 0");
    expect(css).not.toContain('[data-dismiss="hover"]');
    expect(css).toContain("height: var(--yohu-control-height-sm)");
    expect(css).toContain("width: var(--yohu-layout-icon-sm)");
    expect(css).toContain("border-radius: var(--yohu-radius-full)");
    expect(css).toContain("background-color: var(--yohu-fg-2)");
    expect(css).toContain("color: var(--yohu-surface)");
  });

  it("胶囊 hug 可缩、关闭在流内，禁止绝对定位关钮", () => {
    const chipBlock = css.slice(css.indexOf(".yohu-chip {"));
    const chipRule = chipBlock.slice(0, chipBlock.indexOf("}") + 1);
    expect(chipRule).toContain("flex: 0 1 auto");
    expect(chipRule).toContain("min-width: 0");
    expect(chipRule).not.toContain("border-radius:");
    const removeBlock = css.slice(css.indexOf(".yohu-chip__remove {"));
    const removeRule = removeBlock.slice(0, removeBlock.indexOf("}") + 1);
    expect(removeRule).toContain("flex: 0 0 auto");
    expect(removeRule).not.toContain("align-self");
    expect(removeRule).not.toContain("position: absolute");
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});
