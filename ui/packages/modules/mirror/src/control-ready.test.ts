import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { mirrorIsFailed, mirrorIsLive, mirrorIsStarting, mirrorSessionEnded } from "@yohu/api";

import { mirrorControlReady, mirrorLiveBadge, mirrorPictureReady, mirrorSessionAddressable, mirrorSetupEnabled } from "./control-ready";

const ready = {
  phase: "live",
  hasFrame: true,
  readOnly: false,
  control: true,
};

describe("mirrorControlReady", () => {
  it("已出画且可操作才为真", () => {
    expect(mirrorIsLive("live")).toBe(true);
    expect(mirrorIsLive("starting")).toBe(false);
    expect(mirrorIsStarting("starting")).toBe(true);
    expect(mirrorIsStarting("live")).toBe(false);
    expect(mirrorIsFailed("failed")).toBe(true);
    expect(mirrorIsFailed("live")).toBe(false);
    expect(mirrorSessionEnded("stopped")).toBe(true);
    expect(mirrorSessionEnded("failed")).toBe(true);
    expect(mirrorSessionEnded("live")).toBe(false);
    expect(mirrorPictureReady(ready)).toBe(true);
    expect(mirrorPictureReady({ phase: "live", hasFrame: false })).toBe(false);
    expect(mirrorControlReady(ready)).toBe(true);
    expect(mirrorControlReady({ ...ready, phase: "starting" })).toBe(false);
    expect(mirrorControlReady({ ...ready, hasFrame: false })).toBe(false);
    expect(mirrorControlReady({ ...ready, readOnly: true })).toBe(false);
    expect(mirrorControlReady({ ...ready, control: false })).toBe(false);
    expect(mirrorSessionAddressable({ serial: "S1", phase: "live" })).toBe("S1");
    expect(mirrorSessionAddressable({ serial: "S1", phase: "starting" })).toBeNull();
    expect(mirrorSessionAddressable({ serial: null, phase: "live" })).toBeNull();
    expect(mirrorSetupEnabled(["S1"], "idle")).toBe(true);
    expect(mirrorSetupEnabled(["S1"], "live")).toBe(true);
    expect(mirrorSetupEnabled(["S1"], "failed")).toBe(true);
    expect(mirrorSetupEnabled(["S1"], "starting")).toBe(false);
    expect(mirrorSetupEnabled([], "idle")).toBe(false);
  });
});

describe("投屏在播只认一处", () => {
  it("页头、状态栏和存储不再自己比较 live", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(resolve(dir, "MirrorView.tsx"), "utf8");
    const status = readFileSync(resolve(dir, "Status.tsx"), "utf8");
    const store = readFileSync(resolve(dir, "store.ts"), "utf8");
    expect(view).toContain("mirrorIsLive");
    expect(view).toContain("mirrorPictureReady");
    expect(view).not.toContain('phase === "live"');
    expect(view).not.toContain('phase === "starting"');
    expect(status).toContain("mirrorLiveBadge");
    expect(status).not.toContain("mirrorPictureReady");
    expect(status).not.toContain('phase === "live"');
    expect(mirrorLiveBadge({ phase: "live", width: 1220, height: 2712, painted_fps: 0 })).toBe(
      "1220×2712",
    );
    expect(mirrorLiveBadge({ phase: "live", width: 1220, height: 2712, painted_fps: 30 })).toBe(
      "1220×2712 · 30 fps",
    );
    expect(mirrorLiveBadge({ phase: "live", width: 0, height: 2712, painted_fps: 30 })).toBeNull();
    expect(mirrorLiveBadge({ phase: "starting", width: 1220, height: 2712, painted_fps: 30 })).toBeNull();
    expect(store).toContain("mirrorIsLive");
    expect(store).toContain("mirrorIsFailed");
    expect(store).toContain("mirrorSessionEnded");
    expect(store).not.toContain('phase === "live"');
    expect(store).not.toContain('phase !== "live"');
    expect(store).not.toContain('phase === "starting"');
    expect(store).not.toContain('phase === "failed"');
    expect(store).not.toContain('state === "live"');
    expect(store).not.toContain('state === "starting"');
    expect(store).not.toContain('state === "failed"');
    expect(store).not.toContain('state === "stopped"');
    expect(store).not.toContain("!mirrorIsLive(state.phase)");
  });
});

describe("开始与夜览只判一次", () => {
  it("页头不再各写启用条件，视图不再各写未知和开着", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(resolve(dir, "MirrorView.tsx"), "utf8");
    expect(view).toContain("mirrorSetupEnabled");
    expect(view).toContain("nightKnown");
    expect(view).not.toContain("!boundSerial(props.selectedSerials) || starting()");
    expect(view).not.toContain("night === null");
    expect(view).not.toContain("current === null");
    expect(view).not.toContain("mirrorStore.state.night === null");
    expect(view).not.toContain("night === true");
  });
});

function times(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function sourceOf(name: string): string {
  return readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), name), "utf8");
}

describe("会话已在播", () => {
  it("可寻址和已出画都问在播，正在启动不并", () => {
    const source = sourceOf("control-ready.ts");
    expect(times(source, "mirrorIsLive(state." + "phase)")).toBe(1);
    expect(times(source, "function phaseIsLive")).toBe(1);
    expect(times(source, "export function phaseIsLive")).toBe(0);
    expect(times(source, "phaseIsLive(state)")).toBe(2);
    expect(times(source, "!state." + "readOnly")).toBe(1);
    expect(source).toContain("!mirrorIsStarting(phase)");
  });
});

describe("选定的序列号列表", () => {
  it("绑定和启用都读选定列表，字面只留在函数体", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "props." + "selectedSerials")).toBe(1);
    expect(times(view, "function chosenSerials")).toBe(1);
    expect(times(view, "export function chosenSerials")).toBe(0);
    expect(times(view, "chosenSerials()")).toBe(3);
  });
});

describe("视图里的当前阶段", () => {
  it("在播、启动和质量启用都读阶段，开始按钮文案不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "phase")).toBe(1);
    expect(times(view, "function sessionPhase")).toBe(1);
    expect(times(view, "export function sessionPhase")).toBe(0);
    expect(times(view, "sessionPhase()")).toBe(4);
    expect(view).toContain("live() ? " + "\"停止\"");
  });
});

describe("视图里的夜览", () => {
  it("夜览值只读一次，开着和标题不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "night")).toBe(1);
    expect(times(view, "function nightNow")).toBe(1);
    expect(times(view, "export function nightNow")).toBe(0);
    expect(times(view, "nightNow()")).toBe(4);
    expect(times(view, "nightIsOn(nightNow())")).toBe(1);
    expect(times(view, "nightOn()")).toBe(3);
    expect(view).toContain("deviceNightControlTitle(nightNow())");
  });
});

describe("视图里的全屏", () => {
  it("全屏只读一次，类名、图标和标题不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "fullscreen")).toBe(1);
    expect(times(view, "function fullscreenOn")).toBe(1);
    expect(times(view, "export function fullscreenOn")).toBe(0);
    expect(times(view, "fullscreenOn()")).toBe(6);
  });
});

describe("视图里的暂停", () => {
  it("暂停只读一次，图标和标题不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "paused")).toBe(1);
    expect(times(view, "function pausedOn")).toBe(1);
    expect(times(view, "export function pausedOn")).toBe(0);
    expect(times(view, "pausedOn()")).toBe(4);
  });
});

describe("视图里的仅显示", () => {
  it("仅显示只读一次，样式和语气不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "readOnly")).toBe(1);
    expect(times(view, "function readOnlyOn")).toBe(1);
    expect(times(view, "export function readOnlyOn")).toBe(0);
    expect(times(view, "readOnlyOn()")).toBe(5);
  });
});

describe("视图里的长边", () => {
  it("长边只读一次，码率和帧率不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.state." + "maxSize")).toBe(1);
    expect(times(view, "function sizeNow")).toBe(1);
    expect(times(view, "export function sizeNow")).toBe(0);
    expect(times(view, "sizeNow()")).toBe(3);
    expect(times(view, "mirrorStore.state." + "videoBitRate")).toBe(1);
    expect(times(view, "rateNow()")).toBe(3);
    expect(times(view, "mirrorStore.state." + "maxFps")).toBe(1);
    expect(times(view, "fpsNow()")).toBe(3);
  });
});

describe("不能操作", () => {
  it("指针和设备键都问不能操作，夜览禁用不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "!can" + "Control()")).toBe(1);
    expect(times(view, "function controlLocked")).toBe(1);
    expect(times(view, "export function controlLocked")).toBe(0);
    expect(times(view, "controlLocked()")).toBe(3);
    expect(view).toContain("nightTarget() === null");
  });
});

describe("开始和仅显示可点", () => {
  it("两颗页头钮都问同一启用条件", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorSetupEnabled(props.selectedSerials, " + "mirrorStore.state.phase)")).toBe(0);
    expect(times(view, "function setupEnabled")).toBe(1);
    expect(times(view, "export function setupEnabled")).toBe(0);
    expect(times(view, "setupEnabled()")).toBe(3);
  });
});

describe("暂停和全屏不可点", () => {
  it("两颗钮都在不在播时不可点，开始文案不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "!live" + "()")).toBe(1);
    expect(times(view, "function playbackLocked")).toBe(1);
    expect(times(view, "export function playbackLocked")).toBe(0);
    expect(times(view, "playbackLocked()")).toBe(3);
  });
});

describe("当前绑定的序列号", () => {
  it("绑定设备和夜览目标都取这一台", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "boundSerial(props." + "selectedSerials)")).toBe(0);
    expect(times(view, "function selectedSerial")).toBe(1);
    expect(times(view, "export function selectedSerial")).toBe(0);
    expect(times(view, "selectedSerial()")).toBe(4);
  });
});

describe("夜览切换目标", () => {
  it("切换和禁用都问同一目标", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "function nightTarget")).toBe(1);
    expect(times(view, "export function nightTarget")).toBe(0);
    expect(times(view, "nightTarget()")).toBe(3);
    expect(times(view, "nightToggleTarget(")).toBe(2);
  });
});

describe("会话设置推进", () => {
  it("挂载和设置变化都推进同一份", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "mirrorStore.applySettings(props." + "settings)")).toBe(1);
    expect(times(view, "function applySessionSettings")).toBe(1);
    expect(times(view, "export function applySessionSettings")).toBe(0);
    expect(times(view, "applySessionSettings()")).toBe(3);
  });
});

describe("指针离开", () => {
  it("取消和离开都报离开，按下移动抬起不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "reportAvailPointer(event, " + "\"leave\")")).toBe(1);
    expect(times(view, "function reportPointerLeave")).toBe(1);
    expect(times(view, "export function reportPointerLeave")).toBe(0);
    expect(times(view, "={reportPointerLeave}")).toBe(2);
    expect(view).toContain("reportAvailPointer(event, " + "\"down\")");
    expect(view).toContain("reportAvailPointer(event, " + "\"move\")");
    expect(view).toContain("reportAvailPointer(event, " + "\"up\")");
  });
});

describe("设备键钮", () => {
  it("导航和亮度共用一颗钮，夜览不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "void run" + "Op(")).toBe(1);
    expect(times(view, "function DeviceOpButton")).toBe(1);
    expect(times(view, "export function DeviceOpButton")).toBe(0);
    expect(times(view, "<DeviceOpButton ")).toBe(2);
  });
});

describe("失败提示", () => {
  it("四次失败都用错误语气，截图成功不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "\"error\"" + ")")).toBe(1);
    expect(times(view, "function showFailure")).toBe(1);
    expect(times(view, "export function showFailure")).toBe(0);
    expect(times(view, "showFailure(" + "`")).toBe(2);
    expect(times(view, "showFailure(DIALOG_" + "FAILED)")).toBe(1);
    expect(times(view, "showFailure(save" + "FailedText")).toBe(1);
    expect(view).toContain("\"success\"");
  });
});

describe("捕获的异常句子", () => {
  it("三处失败都把异常收成句子，开始失败不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "error" + "Text(e)")).toBe(1);
    expect(times(view, "function caughtText")).toBe(1);
    expect(times(view, "export function caughtText")).toBe(0);
    expect(times(view, "caughtText(e)")).toBe(3);
  });
});

describe("质量数字解析", () => {
  it("长边、码率和帧率都按十进制解析，协议不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "Number.parseInt(v, " + "10)")).toBe(1);
    expect(times(view, "function qualityNumber")).toBe(1);
    expect(times(view, "export function qualityNumber")).toBe(0);
    expect(times(view, "qualityNumber(v)")).toBe(3);
    expect(view).toContain("mirrorProtocolOf(v)");
  });
});

describe("质量选项值", () => {
  it("三个当前值都收成十进制，协议原值不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "String(mirrorStore.state." + "maxSize)")).toBe(0);
    expect(times(view, "String(mirrorStore.state." + "videoBitRate)")).toBe(0);
    expect(times(view, "String(mirrorStore.state." + "maxFps)")).toBe(0);
    expect(times(view, "return String(" + "n)")).toBe(1);
    expect(times(view, "function selectValue")).toBe(1);
    expect(times(view, "export function selectValue")).toBe(0);
    expect(times(view, "selectValue(sizeNow())")).toBe(1);
    expect(times(view, "selectValue(rateNow())")).toBe(1);
    expect(times(view, "selectValue(fpsNow())")).toBe(1);
    expect(view).toContain("value={mirrorStore.state.protocol}");
  });
});

describe("质量行纵排", () => {
  it("四行都是纵排，字面只留在函数体", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "layout=" + "\"stacked\"")).toBe(1);
    expect(times(view, "function QualityRow")).toBe(1);
    expect(times(view, "export function QualityRow")).toBe(0);
    expect(times(view, "<QualityRow ")).toBe(4);
  });
});

describe("质量下拉", () => {
  it("四个下拉都铺满并在启动中禁用，写入各走各的", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "\n        " + "block\n")).toBe(1);
    expect(times(view, "disabled={quality" + "Disabled()}")).toBe(1);
    expect(times(view, "function QualitySelect")).toBe(1);
    expect(times(view, "export function QualitySelect")).toBe(0);
    expect(times(view, "<QualitySelect")).toBe(4);
  });
});

describe("页头钮尺寸", () => {
  it("开始和仅显示都是小号，功能栏间隔不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "size=" + "\"sm\"")).toBe(0);
    expect(times(view, "return " + "\"sm\"")).toBe(1);
    expect(times(view, "function headerButtonSize")).toBe(1);
    expect(times(view, "export function headerButtonSize")).toBe(0);
    expect(times(view, "headerButtonSize()")).toBe(3);
    expect(view).toContain("gap=" + "\"sm\"");
  });
});

describe("操作栏图标尺寸", () => {
  it("设备键和夜览都是中号，质量栏内边距不并", () => {
    const view = sourceOf("MirrorView.tsx");
    expect(times(view, "size=" + "\"md\"")).toBe(0);
    expect(times(view, "return " + "\"md\"")).toBe(1);
    expect(times(view, "function opsIconSize")).toBe(1);
    expect(times(view, "export function opsIconSize")).toBe(0);
    expect(times(view, "opsIconSize()")).toBe(3);
    expect(view).toContain("padding=" + "\"md\"");
  });
});
