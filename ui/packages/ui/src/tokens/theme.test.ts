import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTheme, getThemePreference, onResolvedThemeChange, setTheme, themeFromDark, themeIsDark, themePreferenceIsSystem } from "./index";

function mockScheme(dark: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe("主题切换 setTheme / getTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
    mockScheme(false);
  });

  afterEach(() => {
    setTheme("light");
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-pref");
  });

  it("setTheme(dark) 给 documentElement 设置 data-theme", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme-pref")).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(getTheme()).toBe("dark");
    expect(themeIsDark(getTheme())).toBe(true);
    expect(getThemePreference()).toBe("dark");
  });

  it("未设置时默认 light", () => {
    expect(getTheme()).toBe("light");
    expect(themeIsDark("light")).toBe(false);
    expect(getThemePreference()).toBe("light");
  });

  it("setTheme(light) 覆盖回 light", () => {
    setTheme("dark");
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(getTheme()).toBe("light");
  });

  it("setTheme(system) 跟随 prefers-color-scheme", () => {
    mockScheme(true);
    setTheme("system");
    expect(getThemePreference()).toBe("system");
    expect(getTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme(system) 浅色系统解析为 light", () => {
    mockScheme(false);
    setTheme("system");
    expect(getThemePreference()).toBe("system");
    expect(getTheme()).toBe("light");
  });

  it("onResolvedThemeChange 随 setTheme 推送解析后外观", () => {
    const seen: string[] = [];
    const stop = onResolvedThemeChange((theme) => {
      seen.push(theme);
    });
    setTheme("dark");
    setTheme("light");
    stop();
    setTheme("dark");
    expect(seen).toEqual(["dark", "light"]);
  });
});

describe("深色外观只写一处", () => {
  it("生产源里只有 themeIsDark 比较 theme===dark", () => {
    const packages = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === "node_modules") continue;
          walk(path);
          continue;
        }
        if ((name.endsWith(".ts") || name.endsWith(".tsx")) && !name.includes(".test.")) files.push(path);
      }
    };
    walk(packages);
    for (const path of files) {
      const text = readFileSync(path, "utf8");
      const body = path.endsWith(`${join("tokens", "theme-name.ts")}`)
        ? text.replace('return theme === "dark"', "").replace('return dark ? "dark" : "light"', "")
        : text;
      expect(body, path).not.toContain('theme === "dark"');
      expect(body, path).not.toContain('mode: "light" | "dark"');
      expect(body, path).not.toContain('getTheme() === "dark"');
      expect(body, path).not.toContain('current === "dark"');
      expect(body, path).not.toContain('getAttribute("data-theme") === "dark"');
      expect(body, path).not.toContain('? "dark" : "light"');
    }
  });

  it("跟随系统只判一次", () => {
    expect(themePreferenceIsSystem("system")).toBe(true);
    expect(themePreferenceIsSystem("dark")).toBe(false);
    expect(themePreferenceIsSystem("light")).toBe(false);
    expect(themeFromDark(true)).toBe("dark");
    expect(themeFromDark(false)).toBe("light");
    const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "index.ts"), "utf8");
    const body = text.replace('return theme === "system"', "").replace('"(prefers-color-scheme: dark)"', "");
    expect(body).not.toContain('=== "system"');
    expect(body).not.toContain("prefers-color-scheme: dark");
    expect(body).not.toContain('pref === "dark"');
    expect(body).not.toContain('pref === "light"');
  });
});
