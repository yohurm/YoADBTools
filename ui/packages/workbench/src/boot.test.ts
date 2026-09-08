import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Colors, DarkColors } from "@yohu/ui";
import { DISPLAY_NAME } from "@yohu/api";

const mocks = vi.hoisted(() => ({
  windowShow: vi.fn(async () => undefined),
}));

vi.mock("@yohu/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@yohu/api")>();
  return {
    ...actual,
    windowShow: () => mocks.windowShow(),
  };
});

import {
  dismissBootOverlay,
  resetMainWindowRevealForTests,
  revealMainWindow,
  runBootPipeline,
  waitForNextPaint,
} from "./boot";

describe("启动编排", () => {
  beforeEach(() => {
    mocks.windowShow.mockClear();
    resetMainWindowRevealForTests();
    document.getElementById("yohu-boot")?.remove();
  });

  afterEach(() => {
    resetMainWindowRevealForTests();
    document.getElementById("yohu-boot")?.remove();
  });

  it("waitForNextPaint 等两帧", async () => {
    const frames: number[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(1);
      cb(0);
      return 0;
    });
    await waitForNextPaint();
    expect(frames).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("revealMainWindow 首帧后调用 windowShow，且只揭一次", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    await Promise.all([revealMainWindow(), revealMainWindow()]);
    expect(mocks.windowShow).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("dismissBootOverlay 揭窗前移除启动层", async () => {
    document.body.innerHTML = '<div id="yohu-boot" aria-busy="true"></div>';
    await dismissBootOverlay();
    expect(document.getElementById("yohu-boot")).toBeNull();
  });

  it("runBootPipeline 加载完成后再揭窗，并拆掉启动层", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML = '<div id="yohu-boot"></div>';
    const refresh = vi.fn();
    await runBootPipeline({
      load: async () => undefined,
      refresh,
    });
    expect(mocks.windowShow).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(document.getElementById("yohu-boot")).toBeNull();
    vi.unstubAllGlobals();
  });

  it("index.html 启动层只铺画布，品牌小窗不在 WebView 里", () => {
    const candidates = [
      resolve(process.cwd(), "apps/shell/index.html"),
      resolve(process.cwd(), "../apps/shell/index.html"),
    ];
    const htmlPath = candidates.find((p) => existsSync(p));
    expect(htmlPath).toBeTruthy();
    const html = readFileSync(htmlPath!, "utf8");
    expect(html.toLowerCase()).toContain(Colors.BgBase.toLowerCase());
    expect(html.toLowerCase()).toContain(DarkColors.BgBase.toLowerCase());
    expect(html).toContain('id="yohu-boot"');
    expect(html).toContain(DISPLAY_NAME);
    expect(html).toContain('src="/boot-theme.js"');
    expect(html).not.toContain("boot-reveal.js");
    expect(html).not.toContain("yohu-boot__mark");
    expect(html).not.toContain("boot.reveal");
    expect(html).not.toContain("yohu-boot--leave");
  });
});
