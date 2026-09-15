import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Colors, DarkColors, ZIndex } from "@yohu/ui";
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

function findRepoFile(relPaths: string[]): string {
  const hit = relPaths.map((p) => resolve(process.cwd(), p)).find((p) => existsSync(p));
  expect(hit, relPaths.join(" | ")).toBeTruthy();
  return hit!;
}

function shellHtml(): string {
  return readFileSync(
    findRepoFile(["apps/shell/index.html", "../apps/shell/index.html"]),
    "utf8",
  );
}

function bootInlineCss(html: string): string {
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1];
  if (!css) throw new Error("index.html 没有内联 style");
  return css;
}

function canvasFallbacks(css: string): string[] {
  return [...css.matchAll(/var\(--yohu-canvas,\s*([^)]+)\)/g)].flatMap((m) =>
    m[1] ? [m[1].trim()] : [],
  );
}

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
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await waitForNextPaint();
    expect(frames).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it("隐藏文档不等 rAF，避免启动窗永远不揭", async () => {
    const frames: number[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(1);
      cb(0);
      return 0;
    });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await waitForNextPaint();
    expect(frames).toHaveLength(0);
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

  it("load 上抛则停止揭窗，不 refresh", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    document.body.innerHTML = '<div id="yohu-boot"></div>';
    const refresh = vi.fn();
    await expect(
      runBootPipeline({
        load: async () => {
          throw new Error("hydrate failed");
        },
        refresh,
      }),
    ).rejects.toThrow("hydrate failed");
    expect(mocks.windowShow).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(document.getElementById("yohu-boot")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("揭窗失败上抛，不 refresh", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    mocks.windowShow.mockRejectedValueOnce(new Error("hwnd gone"));
    const refresh = vi.fn();
    await expect(
      runBootPipeline({
        load: async () => undefined,
        refresh,
      }),
    ).rejects.toThrow("hwnd gone");
    expect(refresh).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("index.html 启动层只铺画布，品牌小窗不在 WebView 里", () => {
    const html = shellHtml();
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

  it("深色首帧 fallback 锁 DarkColors.BgBase，且每条背景都走 --yohu-canvas", () => {
    const css = bootInlineCss(shellHtml());
    expect(DarkColors.BgBase.toUpperCase()).toBe("#191A1C");
    expect(css).toContain(`var(--yohu-canvas, ${Colors.BgBase})`);
    expect(css).toContain(`var(--yohu-canvas, ${DarkColors.BgBase})`);
    expect(css).not.toMatch(/background(?:-color)?\s*:\s*#000(?:000)?\b/i);
    const bgDecls = [...css.matchAll(/background(?:-color)?\s*:\s*([^;]+);/g)].flatMap((m) =>
      m[1] ? [m[1].trim()] : [],
    );
    expect(bgDecls.length).toBeGreaterThan(0);
    for (const value of bgDecls) {
      expect(value.startsWith("var(--yohu-canvas,")).toBe(true);
    }
    expect(new Set(canvasFallbacks(css))).toEqual(new Set([Colors.BgBase, DarkColors.BgBase]));
  });

  it("#yohu-boot z-index 锁在 Toast 之上", () => {
    const css = bootInlineCss(shellHtml());
    const block = /#yohu-boot\s*\{([^}]+)\}/.exec(css)?.[1];
    if (!block) throw new Error("#yohu-boot 块缺失");
    const z = Number(/z-index:\s*(\d+)/.exec(block)?.[1]);
    expect(z).toBeGreaterThan(ZIndex.Toast);
    expect(z).toBe(2000);
  });

  it("boot-theme.js 设置 data-theme，不吞异常", () => {
    const js = readFileSync(
      findRepoFile(["apps/shell/public/boot-theme.js", "../apps/shell/public/boot-theme.js"]),
      "utf8",
    );
    expect(js).toContain("prefers-color-scheme: dark");
    expect(js).toContain('setAttribute("data-theme"');
    expect(js).not.toMatch(/catch\s*\(/);
  });

  it("Vite 端口读 tauri.conf.json devUrl，不另写字面量", () => {
    const vite = readFileSync(
      findRepoFile(["apps/shell/vite.config.ts", "../apps/shell/vite.config.ts"]),
      "utf8",
    );
    const tauri = JSON.parse(
      readFileSync(
        findRepoFile([
          "../app/yohu-adbtools/tauri.conf.json",
          "../../app/yohu-adbtools/tauri.conf.json",
          "../../../app/yohu-adbtools/tauri.conf.json",
        ]),
        "utf8",
      ),
    ) as { build?: { devUrl?: string } };
    expect(vite).toContain("tauri.conf.json");
    expect(vite).toContain("devUrl");
    expect(vite).not.toMatch(/\bport:\s*1420\b/);
    expect(tauri.build?.devUrl).toBeTruthy();
    expect(new URL(tauri.build!.devUrl!).port).toBe("1420");
  });
});
