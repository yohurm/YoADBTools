import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name: string): string => readFileSync(resolve(here, name), "utf-8");

const dialogs = load("UpdateDialogs.tsx");
const form = load("SettingsForm.tsx");
const css = load("settings.css");

describe("设置页滚轴", () => {
  it("更新对话框正文走 YoScroller", () => {
    expect(dialogs).toContain("YoScroller");
    expect(dialogs.match(/<YoScroller>/g)?.length).toBe(2);
    expect(dialogs).toContain("yohu-settings__update-desc");
    expect(dialogs).toContain("yohu-settings__update-copy");
  });

  it("表单只在页面级滚，卡片不套 YoScroller", () => {
    expect(form).toContain('class="yohu-settings__scroll"');
    expect(form.match(/<YoScroller[\s>]/g)?.length).toBe(1);
    expect(form).not.toMatch(/<YoPanel[\s\S]*?<YoScroller/);
    expect(form).not.toContain("YoPage");
    expect(form.match(/<YoPanel\b/g)?.length).toBe(7);
    expect(form.match(/overflow="visible"/g)?.length).toBe(7);
    expect(form).not.toContain("deviceLabel");
    expect(css).toContain(".yohu-settings__scroll");
    expect(css).not.toMatch(/overflow:\s*auto/);
    expect(css).not.toMatch(/overflow:\s*scroll/);
    expect(css).not.toMatch(/overflow-y:\s*auto/);
    expect(css).not.toMatch(/overflow-y:\s*scroll/);
  });
});
