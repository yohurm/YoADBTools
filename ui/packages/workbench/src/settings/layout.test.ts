import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string): string => readFileSync(resolve(here, name), "utf-8");

const dialogs = load("UpdateDialogs.tsx");
const form = load("SettingsForm.tsx");
const view = load("SettingsView.tsx");
const path = load("PathChrome.tsx");
const css = load("settings.css");

describe("设置页滚轴", () => {
  it("更新对话框正文走 YoScroller", () => {
    expect(dialogs).toContain("ToastTone");
    expect(dialogs).not.toContain('"success" | "error"');
    expect(dialogs).toContain("YoScroller");
    expect(dialogs.match(/<YoScroller/g)?.length).toBe(2);
    expect(dialogs).toContain("yohu-settings__update-progress--pinned");
    expect(dialogs).toContain("smSize()");
    expect(css).not.toContain(".yohu-progress");
    expect(dialogs).toContain("yohu-settings__update-desc");
    expect(dialogs).toContain("yohu-settings__update-copy");
  });

  it("open 走开关，关窗不清 pending，出场再 dismiss", () => {
    expect(dialogs).toContain("dialogOpen");
    expect(dialogs).toContain("onExitComplete");
    expect(dialogs).toContain("updateStore.close()");
    expect(dialogs).toContain("updateStore.dismiss()");
    expect(dialogs).not.toContain("onClose={() => updateStore.dismiss()}");
    expect(dialogs).not.toContain("pending() !== null");
  });

  it("Toaster 随视图卸载 destroy，禁止静态 Toast.success", () => {
    expect(view).toContain("createToaster()");
    expect(view).toContain("onCleanup(() => toaster.destroy())");
    expect(view).not.toContain("Toast.success");
  });

  it("表单只在页面级滚，卡片不套 YoScroller", () => {
    expect(view).toContain('role="settings"');
    expect(view).toContain("YoPage");
    expect(form).toContain('class="yohu-settings__scroll"');
    expect(form.match(/<YoScroller[\s>]/g)?.length).toBe(1);
    expect(form).not.toMatch(/<YoPanel[\s\S]*?<YoScroller/);
    expect(form).not.toContain("YoPage");
    expect(form).not.toContain("yohu-settings__body");
    expect(form.match(/<YoPanel\b/g)?.length).toBe(7);
    expect(form.match(/overflow="visible"/g)?.length ?? 0).toBe(0);
    expect(form.match(/panelOverflow\(\)/g)?.length).toBe(8);
    expect(form).not.toContain("deviceLabel");
    expect(form).toContain("LOG_DISPLAY_COLUMN_CATALOG");
    expect(form).not.toContain("LOG_COLUMN_OPTIONS");
    expect(css).not.toContain(".yohu-settings__body");
    expect(css).not.toContain("path-field");
    expect(css).not.toMatch(/overflow:\s*auto/);
    expect(css).not.toMatch(/overflow:\s*scroll/);
    expect(css).not.toMatch(/overflow-y:\s*auto/);
    expect(css).not.toMatch(/overflow-y:\s*scroll/);
  });

  it("路径槽走 YoTextField width=control，禁止页面再套一层", () => {
    expect(path).toContain('width="control"');
    expect(path).not.toContain("block");
    expect(path).not.toContain("path-field");
    expect(css).not.toContain("path-field");
    expect(css).not.toContain("settings-control-max");
  });

  it("重启与下次采集的保存提示不再复述徽章", () => {
    expect(form).toContain('return "已保存"');
    expect(form).toContain("savedAck()");
    expect(form).toContain('text="重启生效"');
    expect(form).toContain('text="下次采集生效"');
    expect(form).not.toContain("已保存（重启生效）");
    expect(form).not.toContain("已保存（下次采集生效）");
    expect(form).not.toContain("已保存（下次启动生效）");
    expect(form).not.toContain("已保存（窗口立即裁剪，采集环下次启动）");
  });

  it("设备自动刷新是开关，无间隔秒数字段", () => {
    expect(form).toContain("autoRefreshCopy()");
    expect(form).toContain('return "设备自动刷新"');
    expect(form).not.toContain("自动刷新间隔");
    expect(form).not.toContain("间隔（秒");
    expect(form).not.toContain("0 = 关");
  });

  it("关于页挂载读一次通道，渲染期不打 update.info", () => {
    expect(view).toContain("onMount(() => {\n    void updateStore.loadChannel();");
    expect(view).not.toContain("updateInfo(");
    expect(view).not.toContain("createEffect");
    expect(form).toContain("channelRemote()");
    expect(form).not.toContain("updateInfo(");
    expect(form).toContain('title="更新通道"');
  });

  it("待装包大小零默认只写在 pendingBytes", () => {
    const needle = "size_bytes " + "?? 0";
    expect(dialogs.split(needle).length - 1).toBe(1);
    expect(dialogs).toContain("pendingBytes()");
  });
});
