import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoChip } from "./Chip";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Chip.css"), "utf8");

describe("YoChip", () => {
  it("默认 accent，删除钮流内右上", () => {
    const onDismiss = vi.fn();
    const { container } = render(() => <YoChip text="HfLooper" onDismiss={onDismiss} />);
    const host = container.querySelector(".yohu-chip");
    expect(host?.getAttribute("data-tone")).toBe("accent");
    expect(host?.getAttribute("data-dismiss")).toBe("true");
    const remove = screen.getByRole("button", { name: "移除 HfLooper" });
    expect(host?.contains(remove)).toBe(true);
    fireEvent.click(remove);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("无 onDismiss 不画删除", () => {
    render(() => <YoChip text="libc" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("气泡 hug 可缩、关闭在流内，禁止绝对定位与可见溢出", () => {
    const chipBlock = css.slice(css.indexOf(".yohu-chip {"));
    const chipRule = chipBlock.slice(0, chipBlock.indexOf("}") + 1);
    expect(chipRule).toContain("flex: 0 1 auto");
    expect(chipRule).toContain("min-width: 0");
    expect(chipRule).toContain("overflow: hidden");
    expect(chipRule).not.toContain("overflow: visible");
    expect(chipRule).not.toContain("position: relative");

    const removeBlock = css.slice(css.indexOf(".yohu-chip__remove {"));
    const removeRule = removeBlock.slice(0, removeBlock.indexOf("}") + 1);
    expect(removeRule).toContain("align-self: flex-start");
    expect(removeRule).toContain("flex: 0 0 auto");
    expect(removeRule).not.toContain("position: absolute");

    const labelBlock = css.slice(css.indexOf(".yohu-chip__label {"));
    const labelRule = labelBlock.slice(0, labelBlock.indexOf("}") + 1);
    expect(labelRule).toContain("text-overflow: ellipsis");
    expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });
});
