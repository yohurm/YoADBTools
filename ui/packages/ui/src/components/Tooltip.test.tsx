import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";

import { motionSpecMs } from "../tokens/motion";
import { YoTooltip, YoTooltipHost } from "./Tooltip";
import { tooltipNoteInput, tooltipUnique } from "./tooltip-policy";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "Tooltip.css"), "utf8");

function enterAnchor(name: string): void {
  const trigger = screen.getByRole("button", { name });
  fireEvent.mouseEnter(trigger.parentElement as HTMLElement);
}

function leaveAnchor(name: string): void {
  const trigger = screen.getByRole("button", { name });
  fireEvent.mouseLeave(trigger.parentElement as HTMLElement);
}

describe("YoTooltip", () => {
  afterEach(() => {
    tooltipUnique.dismiss();
    tooltipNoteInput("pointer");
    vi.useRealTimers();
  });

  it("无 Host 时不画 popup（必须挂回树）", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltip content="保存">
        <button type="button">锚</button>
      </YoTooltip>
    ));
    enterAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Host 下悬停延迟后出现唯一 tooltip", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="保存">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("锚");
    expect(tooltipUnique.session()).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(tooltipUnique.session()?.content).toBe("保存");
    expect(screen.getByRole("tooltip").textContent).toBe("保存");
  });

  it("两个锚点共用一个 popup，不是两棵 Portal", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="复制">
          <button type="button">一</button>
        </YoTooltip>
        <YoTooltip content="粘贴">
          <button type="button">二</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("一");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    enterAnchor("二");
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toBe("粘贴");
  });

  it("禁用不出示", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="保存" disabled>
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("空文案不出示", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="   ">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("指针点击后的程序移焦不出示（模态首焦不是悬停）", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="新增组">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    fireEvent.pointerDown(document.body);
    const trigger = screen.getByRole("button", { name: "锚" });
    trigger.focus();
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(tooltipUnique.session()).toBeNull();
  });

  it("键盘 Tab 焦点延迟后出示", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="新增组">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    fireEvent.keyDown(document, { key: "Tab" });
    screen.getByRole("button", { name: "锚" }).focus();
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.getByRole("tooltip").textContent).toBe("新增组");
  });

  it("按下锚点立即卸槽，不跟隐藏延迟", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="保存">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "锚" }).parentElement as HTMLElement);
    expect(tooltipUnique.session()).toBeNull();
  });

  it("stretch 写 data-stretch，铺满交叉轴而不改成 block", () => {
    render(() => (
      <YoTooltip content="Verbose" stretch>
        <button type="button">V</button>
      </YoTooltip>
    ));
    const anchor = screen.getByRole("button", { name: "V" }).parentElement;
    expect(anchor?.hasAttribute("data-stretch")).toBe(true);
    expect(anchor?.hasAttribute("data-block")).toBe(false);
    expect(css).toContain("[data-stretch]");
    expect(css).toContain("height: 100%");
    expect(css).toContain("align-self: stretch");
  });

  it("离开锚点后延迟卸节点", () => {
    vi.useFakeTimers();
    render(() => (
      <YoTooltipHost>
        <YoTooltip content="保存">
          <button type="button">锚</button>
        </YoTooltip>
      </YoTooltipHost>
    ));
    enterAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsEnter"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    leaveAnchor("锚");
    vi.advanceTimersByTime(motionSpecMs("effectsFast"));
    vi.advanceTimersByTime(motionSpecMs("effectsExit") + 50);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
