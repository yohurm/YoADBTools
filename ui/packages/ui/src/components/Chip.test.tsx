import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoChip } from "./Chip";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "Chip.css"), "utf8");
const motionCss = readFileSync(resolve(here, "../tokens/motion.css"), "utf8");

describe("YoChip", () => {
  it("默认 accent，删除钮流内右侧", () => {
    const onDismiss = vi.fn();
    const { container } = render(() => <YoChip text="HfLooper" onDismiss={onDismiss} />);
    const host = container.querySelector(".yohu-chip");
    expect(host?.getAttribute("data-tone")).toBe("accent");
    expect(host?.getAttribute("data-dismiss")).toBe("always");
    expect(host?.getAttribute("title")).toBeNull();
    const remove = screen.getByRole("button", { name: "移除 HfLooper" });
    expect(host?.contains(remove)).toBe(true);
    fireEvent.click(remove);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(remove.hasAttribute("data-dialog-skip")).toBe(true);
  });

  it("block 铺满父格，文案吃中间、关闭贴盒尾", () => {
    const { container } = render(() => <YoChip text="app.apk" block onDismiss={() => undefined} />);
    expect(container.querySelector(".yohu-chip")?.hasAttribute("data-block")).toBe(true);
    expect(css).toContain(".yohu-chip[data-block]");
    expect(css).toContain("width: 100%");
    const blockLabel = css.slice(css.indexOf(".yohu-chip[data-block] .yohu-chip__label"));
    expect(blockLabel.slice(0, blockLabel.indexOf("}") + 1)).toContain("flex: 1 1 auto");
    expect(css).not.toContain("position: absolute");
  });

  it("无 onDismiss 不画删除", () => {
    render(() => <YoChip text="libc" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("leading 流内前导，hover 关闭仍占位", () => {
    const { container } = render(() => (
      <YoChip text="app.apk" leading="folder" dismiss="hover" onDismiss={() => undefined} />
    ));
    const host = container.querySelector(".yohu-chip");
    expect(host?.getAttribute("data-leading")).toBe("true");
    expect(host?.getAttribute("data-dismiss")).toBe("hover");
    expect(host?.querySelector(".yohu-chip__leading [data-icon='folder']")).toBeTruthy();
    expect(host?.querySelector(".yohu-chip__label")?.getAttribute("title")).toBeNull();
  });

  it("气泡 hug 可缩、关闭在流内，禁止绝对定位与可见溢出", () => {
    const chipBlock = css.slice(css.indexOf(".yohu-chip {"));
    const chipRule = chipBlock.slice(0, chipBlock.indexOf("}") + 1);
    expect(chipRule).toContain("flex: 0 1 auto");
    expect(chipRule).toContain("min-width: 0");
    expect(chipRule).toContain("overflow: hidden");
    expect(chipRule).toContain("align-items: center");
    expect(chipRule).not.toContain("overflow: visible");
    expect(chipRule).not.toContain("position: relative");

    const removeBlock = css.slice(css.indexOf(".yohu-chip__remove {"));
    const removeRule = removeBlock.slice(0, removeBlock.indexOf("}") + 1);
    expect(removeRule).toContain("flex: 0 0 auto");
    expect(removeRule).not.toContain("align-self");
    expect(removeRule).not.toContain("position: absolute");

    const leadingBlock = css.slice(css.indexOf(".yohu-chip__leading {"));
    const leadingRule = leadingBlock.slice(0, leadingBlock.indexOf("}") + 1);
    expect(leadingRule).toContain("flex: 0 0 auto");
    expect(leadingRule).not.toContain("position: absolute");

    const labelBlock = css.slice(css.indexOf(".yohu-chip__label {"));
    const labelRule = labelBlock.slice(0, labelBlock.indexOf("}") + 1);
    expect(labelRule).toContain("text-overflow: ellipsis");
    expect(css).toContain('[data-dismiss="hover"]');
    expect(css).toContain("transition: opacity var(--yohu-motion-effects-fast)");
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    expect(css).not.toContain("prefers-reduced-motion");
    const reduce = motionCss.slice(motionCss.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduce).toContain('.yohu-chip[data-dismiss="hover"] .yohu-chip__remove');
  });
});
