import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { presenceBornState } from "./presence-model";

describe("presenceBornState", () => {
  it("transition 且播动效时出生 closed，才能从位移/0fr 起步", () => {
    expect(presenceBornState({ when: true, delayOpen: true, skipMotion: false })).toBe("closed");
  });

  it("跳过动效或非 transition 出生即 open", () => {
    expect(presenceBornState({ when: true, delayOpen: true, skipMotion: true })).toBe("open");
    expect(presenceBornState({ when: true, delayOpen: false, skipMotion: false })).toBe("open");
  });

  it("when=false 出生 closed", () => {
    expect(presenceBornState({ when: false, delayOpen: true, skipMotion: false })).toBe("closed");
  });

  it("open / closed 只写在模型", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    for (const name of ["presence-model.ts", "presence.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      if (name === "presence-model.ts") body = body.replace('export type PresenceState = "open" | "closed";', "");
      expect(body, name).not.toContain('"open" | "closed"');
    }
  });

  it("animationend 与 transitionend 经 listen 各登记一次", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("add" + "EventListener")).toBe(1);
    expect(count("remove" + "EventListener")).toBe(1);
    expect(count("host?." + "addEventListener")).toBe(1);
    expect(count("host?." + "removeEventListener")).toBe(1);
    expect(body).toContain('listen("animationend", onAnimationEnd)');
    expect(body).toContain('listen("transitionend", onTransitionEnd)');
  });
});

describe("出场等待开场", () => {
  it("裁切进场两处走 presenceWaitsToOpen，出生与出场不并", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("presenceUsesClip(recipe) && " + "!shouldSkipMotion()")).toBe(1);
    expect(count("function presenceWaitsToOpen")).toBe(1);
    expect(count("presenceWaitsToOpen(recipe)")).toBe(2);
    expect(count("export function presenceWaitsToOpen")).toBe(0);
    expect(body).toContain("delayOpen: presenceUsesClip(recipeOf())");
    expect(body).toContain("if (shouldSkipMotion())");
    expect(body).toContain('listen("animationend"');
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场世代", () => {
  it("两处经 presenceNextGen 加一，声明不导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("++" + "exitGen")).toBe(0);
    expect(count("presenceNextGen(exitGen)")).toBe(2);
    expect(count("function presenceNextGen")).toBe(1);
    expect(count("export function presenceNextGen")).toBe(0);
    expect(count("return current + 1")).toBe(1);
    expect(body).toContain("function presenceWaitsToOpen");
    expect(count("presenceWaitsToOpen(recipe)")).toBe(2);
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场世代过期", () => {
  it("两处经 presenceGenStale 返回，比较只留在函数体", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("gen !== " + "exitGen")).toBe(1);
    expect(count("function presenceGenStale")).toBe(1);
    expect(count("export function presenceGenStale")).toBe(0);
    expect(count("presenceGenStale(gen, exitGen)")).toBe(2);
    expect(count("presenceNextGen(exitGen)")).toBe(2);
    expect(count("++" + "exitGen")).toBe(0);
    expect(body).toContain("function presenceWaitsToOpen");
    expect(count("add" + "EventListener")).toBe(1);
    expect(count("window.clearTimeout(timer)")).toBe(2);
  });
});

describe("出场事件收尾", () => {
  it("animationend 与 transitionend 经 presenceFinishTimed 清定时器再收尾", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("presenceFinishTimed(timer, finishExit, gen)")).toBe(2);
    expect(count("function presenceFinishTimed")).toBe(1);
    expect(count("export function presenceFinishTimed")).toBe(0);
    expect(count("window.clearTimeout(timer)")).toBe(2);
    expect(count("finishExit(" + "gen)")).toBe(2);
    expect(count("finish(gen)")).toBe(1);
    expect(body).toContain("function presenceGenStale");
    expect(count("presenceGenStale(gen, exitGen)")).toBe(2);
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场写成打开", () => {
  it("三处经 presenceMarkOpen 写成打开，字面只留在函数体", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("setState(\"" + "open\")")).toBe(1);
    expect(count("function presenceMarkOpen")).toBe(1);
    expect(count("export function presenceMarkOpen")).toBe(0);
    expect(count("presenceMarkOpen(setState)")).toBe(3);
    expect(count("setState(\"" + "closed\")")).toBe(1);
    expect(body).toContain("function presenceFinishTimed");
    expect(count("presenceFinishTimed(timer, finishExit, gen)")).toBe(2);
    expect(count("window.clearTimeout(timer)")).toBe(2);
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场清掉退出", () => {
  it("三处经 presenceClearExiting 清掉退出，字面只留在函数体", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("setExiting(" + "false)")).toBe(1);
    expect(count("function presenceClearExiting")).toBe(1);
    expect(count("export function presenceClearExiting")).toBe(0);
    expect(count("presenceClearExiting(setExiting)")).toBe(3);
    expect(count("setExiting(" + "true)")).toBe(1);
    expect(body).toContain("function presenceMarkOpen");
    expect(count("presenceMarkOpen(setState)")).toBe(3);
    expect(count("setState(\"" + "open\")")).toBe(1);
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场写成在场", () => {
  it("两处经 presenceMarkPresent 写成在场，字面只留在函数体", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("setPresent(" + "true)")).toBe(1);
    expect(count("function presenceMarkPresent")).toBe(1);
    expect(count("export function presenceMarkPresent")).toBe(0);
    expect(count("presenceMarkPresent(setPresent)")).toBe(2);
    expect(count("setPresent(" + "false)")).toBe(1);
    expect(body).toContain("function presenceClearExiting");
    expect(count("presenceClearExiting(setExiting)")).toBe(3);
    expect(count("setExiting(" + "false)")).toBe(1);
    expect(count("add" + "EventListener")).toBe(1);
  });
});

describe("出场取消进场帧", () => {
  it("两处经 presenceCancelFrame 取消帧号，声明不导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("if (enterRaf" + "1)")).toBe(0);
    expect(count("if (enterRaf" + "2)")).toBe(0);
    expect(count("window.cancelAnimationFrame(enterRaf" + "1)")).toBe(0);
    expect(count("window.cancelAnimationFrame(enterRaf" + "2)")).toBe(0);
    expect(count("window.cancelAnimationFrame(id)")).toBe(1);
    expect(count("function presenceCancelFrame")).toBe(1);
    expect(count("export function presenceCancelFrame")).toBe(0);
    expect(count("presenceCancelFrame(enterRaf1)")).toBe(1);
    expect(count("presenceCancelFrame(enterRaf2)")).toBe(1);
    expect(count("window.requestAnimationFrame")).toBe(1);
    expect(count("enterRaf1 = 0")).toBe(2);
    expect(count("presenceMarkPresent(setPresent)")).toBe(2);
    expect(count("setPresent(" + "true)")).toBe(1);
  });
});

describe("出场登记进场帧", () => {
  it("两处经 presenceNextFrame 登记下一帧，声明不导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("enterRaf1 = window.request" + "AnimationFrame")).toBe(0);
    expect(count("enterRaf2 = window.request" + "AnimationFrame")).toBe(0);
    expect(count("window.requestAnimationFrame(run)")).toBe(1);
    expect(count("function presenceNextFrame")).toBe(1);
    expect(count("export function presenceNextFrame")).toBe(0);
    expect(count("presenceNextFrame(() =>")).toBe(2);
    expect(body).toContain("function presenceCancelFrame");
    expect(count("presenceCancelFrame(enterRaf1)")).toBe(1);
    expect(count("presenceCancelFrame(enterRaf2)")).toBe(1);
    expect(count("window.cancelAnimationFrame(id)")).toBe(1);
    expect(count("enterRaf1 = 0")).toBe(2);
  });
});

describe("出场读开关", () => {
  it("两处经 presenceWhenFlag 读开关，声明不导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("Boolean(" + "props.when)")).toBe(0);
    expect(count("function presenceWhenFlag")).toBe(1);
    expect(count("export function presenceWhenFlag")).toBe(0);
    expect(count("return Boolean(when)")).toBe(1);
    expect(count("presenceWhenFlag(props.when)")).toBe(2);
    expect(count("props.when === true")).toBe(1);
    expect(count("presenceUsesClip(recipeOf())")).toBe(2);
    expect(body).toContain("function presenceNextFrame");
    expect(count("presenceNextFrame(() =>")).toBe(2);
    expect(count("window.requestAnimationFrame(run)")).toBe(1);
  });
});

describe("出场不在场就停", () => {
  it("两处经 presenceGone 判断不在场就停，声明不导出", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const body = readFileSync(join(root, "presence.tsx"), "utf8");
    const count = (needle: string): number => body.split(needle).length - 1;
    expect(count("if (!" + "present()) return")).toBe(0);
    expect(count("function presenceGone")).toBe(1);
    expect(count("export function presenceGone")).toBe(0);
    expect(count("return !present")).toBe(1);
    expect(count("presenceGone(present())")).toBe(2);
    expect(count("if (!want()) return")).toBe(1);
    expect(body).toContain("function presenceWhenFlag");
    expect(count("presenceWhenFlag(props.when)")).toBe(2);
    expect(count("props.when === true")).toBe(1);
    expect(count("presenceUsesClip(recipeOf())")).toBe(2);
  });
});
