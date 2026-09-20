import { describe, expect, it } from "vitest";

import {
  LogcatLevelDark,
  LogcatLevelLight,
  LogcatMessageDark,
  LogcatMessageLight,
  LogcatTagDark,
  LogcatTagLight,
  logcatThemeVars,
} from "./logcat";

describe("官方 Android Studio Logcat V2 板", () => {
  it("消息字色锁官方 Default / Darcula", () => {
    expect(LogcatMessageLight).toEqual({
      v: "#000000",
      d: "#389FD6",
      i: "#59A869",
      w: "#645607",
      e: "#CD0000",
      f: "#CD0000",
    });
    expect(LogcatMessageDark).toEqual({
      v: "#BBBBBB",
      d: "#299999",
      i: "#ABC023",
      w: "#BBB529",
      e: "#FF6B68",
      f: "#FF6B68",
    });
  });

  it("Assert 与 Error 同消息色，徽章更深，不是社区紫", () => {
    expect(LogcatMessageLight.f).toBe(LogcatMessageLight.e);
    expect(LogcatMessageDark.f).toBe(LogcatMessageDark.e);
    expect(LogcatLevelLight.f.bg).toBe("#7F0000");
    expect(LogcatLevelDark.f.bg).toBe("#8B3C3C");
    expect(LogcatLevelLight.f.bg).not.toBe(LogcatLevelLight.e.bg);
    expect(LogcatLevelDark.f.bg).not.toBe(LogcatLevelDark.e.bg);
  });

  it("Tag 色板 80 档（16 族 × 5 阶）且浅深等长", () => {
    expect(LogcatTagLight).toHaveLength(80);
    expect(LogcatTagDark).toHaveLength(80);
    expect(LogcatTagLight[0]).toBe("#414D41");
    expect(LogcatTagLight[16]).toBe("#485648");
    expect(LogcatTagDark[0]).toBe("#929292");
    expect(LogcatTagDark[16]).toBe("#A3A3A3");
  });

  it("主题变量名由本板排出", () => {
    const vars = logcatThemeVars(LogcatMessageLight, LogcatLevelLight, LogcatTagLight);
    expect(vars).toContainEqual(["--yohu-logcat-msg-e", LogcatMessageLight.e]);
    expect(vars).toContainEqual(["--yohu-logcat-level-f-bg", LogcatLevelLight.f.bg]);
    expect(vars).toContainEqual(["--yohu-logcat-tag-0", LogcatTagLight[0]]);
    expect(vars.filter(([name]) => name.startsWith("--yohu-logcat-tag-"))).toHaveLength(80);
  });
});
