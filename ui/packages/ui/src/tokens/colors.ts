/**
 * 色彩 token（三层架构，见 docs/architecture/UI设计系统-v6.md §2）：
 *   Primitive = HarmonyOS NEXT 系统基础/语义 Token（色彩.md 全量表）
 * → Semantic（--yohu-* 消费名，浅/深各一板）
 * → Component（级别板 / 文件图标板 / 交互态）
 *
 * 组件与模块样式 100% 引用语义/组件层，禁止裸色值。
 * 来源：yovo-harmonyos-docs / 设计指南 / 通用设计基础 / 视觉风格 / 色彩.md
 * 深色 background_primary 表值 #E5E5E5 与正文「深色 Primary/Secondary = 黑」冲突，
 * 落地以正文为准（harmonyos-design-notes.md §1.4）。
 * 深色次级表面走 gray_02 之后的下一档实色（background_fourth），保证层级随明度抬升，
 * 禁止再映射成比卡片更暗的 background_secondary。
 */

/** HarmonyOS ARGB `#AARRGGBB` → CSS `#RRGGBB` / `#RRGGBBAA`。 */
function fromArgb(argb: string): string {
  const hex = argb.replace(/^#/, "").toUpperCase();
  if (hex.length !== 8) {
    throw new Error(`HarmonyOS ARGB 须为 8 位: ${argb}`);
  }
  const aa = hex.slice(0, 2);
  const rgb = hex.slice(2);
  return aa === "FF" ? `#${rgb}` : `#${rgb}${aa}`;
}

/**
 * Primitive 层：官方系统 Token（仅本文件与契约测试引用）。
 * 键名对齐鸿蒙 `brand` / `font_*` / `background_*` / `comp_*`。
 */
export const Harmony = {
  brand: { light: fromArgb("#ff0a59f7"), dark: fromArgb("#ff317af7") },
  warning: { light: fromArgb("#ffe84026"), dark: fromArgb("#ffd94838") },
  alert: { light: fromArgb("#ffed6f21"), dark: fromArgb("#ffdb6b42") },
  confirm: { light: fromArgb("#ff64bb5c"), dark: fromArgb("#ff5ba854") },

  fontPrimary: { light: fromArgb("#e5000000"), dark: fromArgb("#e5ffffff") },
  fontSecondary: { light: fromArgb("#99000000"), dark: fromArgb("#99ffffff") },
  fontTertiary: { light: fromArgb("#66000000"), dark: fromArgb("#66ffffff") },
  fontFourth: { light: fromArgb("#33000000"), dark: fromArgb("#33ffffff") },
  fontEmphasize: { light: fromArgb("#ff0a59f7"), dark: fromArgb("#ff317af7") },
  fontOnPrimary: { light: fromArgb("#ffffffff"), dark: fromArgb("#ffffffff") },

  backgroundPrimary: { light: fromArgb("#ffffffff"), dark: "#000000" },
  backgroundSecondary: { light: fromArgb("#fff1f3f5"), dark: fromArgb("#ff191a1c") },
  backgroundTertiary: { light: fromArgb("#ffe5e5ea"), dark: fromArgb("#ff202224") },
  backgroundFourth: { light: fromArgb("#ffd1d1d6"), dark: fromArgb("#ff2e3033") },
  backgroundEmphasize: { light: fromArgb("#ff0a59f7"), dark: fromArgb("#ff317af7") },

  compBackgroundPrimary: { light: fromArgb("#ffffffff"), dark: fromArgb("#ff202224") },
  compBackgroundGray: { light: fromArgb("#fff1f3f5"), dark: fromArgb("#ffe5e5ea") },
  /** 控件二级底；Switch 关闭轨默认（API 20：浅 10% 黑 / 深 10% 白）。 */
  compBackgroundSecondary: { light: fromArgb("#19000000"), dark: fromArgb("#19ffffff") },
  compEmphasizeSecondary: { light: fromArgb("#330a59f7"), dark: fromArgb("#33317af7") },
  compEmphasizeTertiary: { light: fromArgb("#190a59f7"), dark: fromArgb("#19317af7") },
  /** 文档选字底。20% 是徽章；100% 是列表选中片；选字取品牌 45%。 */
  compTextSelection: { light: fromArgb("#730a59f7"), dark: fromArgb("#73317af7") },
  compDivider: { light: fromArgb("#33000000"), dark: fromArgb("#33ffffff") },
  iconSubEmphasize: { light: fromArgb("#660a59f7"), dark: fromArgb("#66317af7") },

  /** 10% 语义色软底（官方透明度映射，无独立 Token 名）。 */
  confirmSoft: { light: fromArgb("#1964bb5c"), dark: fromArgb("#195ba854") },
  alertSoft: { light: fromArgb("#19ed6f21"), dark: fromArgb("#19db6b42") },
  warningSoft: { light: fromArgb("#19e84026"), dark: fromArgb("#19d94838") },
} as const;

/** 实心底 hover/pressed = 语义色叠官方 interactive 5% / 10%。 */
function brandOverlay(brand: string, ink: "#000000" | "#FFFFFF", percent: number): string {
  return `color-mix(in srgb, ${ink} ${percent}%, ${brand})`;
}

// ===== Semantic 层（浅色主题） =====

export const Colors = {
  BgBase: Harmony.backgroundSecondary.light,
  Surface: Harmony.compBackgroundPrimary.light,
  Surface2: Harmony.backgroundTertiary.light,
  Fg: Harmony.fontPrimary.light,
  Fg2: Harmony.fontSecondary.light,
  Fg3: Harmony.fontTertiary.light,
  Fg4: Harmony.fontFourth.light,
  FgOn: Harmony.fontOnPrimary.light,
  Border: Harmony.compDivider.light,
  BorderStrong: Harmony.fontTertiary.light,
  Accent: Harmony.brand.light,
  AccentSoft: Harmony.compEmphasizeSecondary.light,
  AccentHover: brandOverlay(Harmony.brand.light, "#000000", 5),
  AccentPressed: brandOverlay(Harmony.brand.light, "#000000", 10),
  Success: Harmony.confirm.light,
  SuccessBg: Harmony.confirmSoft.light,
  SuccessHover: brandOverlay(Harmony.confirm.light, "#000000", 5),
  SuccessPressed: brandOverlay(Harmony.confirm.light, "#000000", 10),
  Warn: Harmony.alert.light,
  WarnBg: Harmony.alertSoft.light,
  WarnHover: brandOverlay(Harmony.alert.light, "#000000", 5),
  WarnPressed: brandOverlay(Harmony.alert.light, "#000000", 10),
  Error: Harmony.warning.light,
  SignalBg: Harmony.warningSoft.light,
  ErrorHover: brandOverlay(Harmony.warning.light, "#000000", 5),
  ErrorPressed: brandOverlay(Harmony.warning.light, "#000000", 10),
  Offline: Harmony.fontTertiary.light,
  FocusRing: Harmony.iconSubEmphasize.light,
  /** Family A 文档选区。禁止用 accent-soft / state-selected 冒充。 */
  TextSel: Harmony.compTextSelection.light,
  Tag: Harmony.alert.light,
  Splitter: Harmony.compDivider.light,
  SplitterHover: Harmony.fontSecondary.light,
  Disabled: Harmony.backgroundFourth.light,
  /** YoSwitch 关闭轨（Toggle unselectedColor）。 */
  SwitchOff: Harmony.compBackgroundSecondary.light,
  SwitchOffHover: `color-mix(in srgb, ${Harmony.fontPrimary.light} 5%, ${Harmony.compBackgroundSecondary.light})`,
  SwitchOffPressed: `color-mix(in srgb, ${Harmony.fontPrimary.light} 10%, ${Harmony.compBackgroundSecondary.light})`,
} as const;

export type SemanticColorName = keyof typeof Colors;

export const DarkColors: Record<SemanticColorName, string> = {
  BgBase: Harmony.backgroundPrimary.dark,
  Surface: Harmony.compBackgroundPrimary.dark,
  /** 深色灰阶随层级抬升：page 黑 → 卡片 #202224 → 次级 #2E3033（background_fourth）。 */
  Surface2: Harmony.backgroundFourth.dark,
  Fg: Harmony.fontPrimary.dark,
  Fg2: Harmony.fontSecondary.dark,
  Fg3: Harmony.fontTertiary.dark,
  Fg4: Harmony.fontFourth.dark,
  FgOn: Harmony.fontOnPrimary.dark,
  Border: Harmony.compDivider.dark,
  BorderStrong: Harmony.fontTertiary.dark,
  Accent: Harmony.brand.dark,
  AccentSoft: Harmony.compEmphasizeSecondary.dark,
  AccentHover: brandOverlay(Harmony.brand.dark, "#FFFFFF", 5),
  AccentPressed: brandOverlay(Harmony.brand.dark, "#FFFFFF", 10),
  Success: Harmony.confirm.dark,
  SuccessBg: Harmony.confirmSoft.dark,
  SuccessHover: brandOverlay(Harmony.confirm.dark, "#FFFFFF", 5),
  SuccessPressed: brandOverlay(Harmony.confirm.dark, "#FFFFFF", 10),
  Warn: Harmony.alert.dark,
  WarnBg: Harmony.alertSoft.dark,
  WarnHover: brandOverlay(Harmony.alert.dark, "#FFFFFF", 5),
  WarnPressed: brandOverlay(Harmony.alert.dark, "#FFFFFF", 10),
  Error: Harmony.warning.dark,
  SignalBg: Harmony.warningSoft.dark,
  ErrorHover: brandOverlay(Harmony.warning.dark, "#FFFFFF", 5),
  ErrorPressed: brandOverlay(Harmony.warning.dark, "#FFFFFF", 10),
  Offline: Harmony.fontTertiary.dark,
  FocusRing: Harmony.iconSubEmphasize.dark,
  TextSel: Harmony.compTextSelection.dark,
  Tag: Harmony.alert.dark,
  Splitter: Harmony.compDivider.dark,
  SplitterHover: Harmony.fontSecondary.dark,
  Disabled: Harmony.backgroundFourth.dark,
  SwitchOff: Harmony.compBackgroundSecondary.dark,
  SwitchOffHover: `color-mix(in srgb, ${Harmony.fontPrimary.dark} 5%, ${Harmony.compBackgroundSecondary.dark})`,
  SwitchOffPressed: `color-mix(in srgb, ${Harmony.fontPrimary.dark} 10%, ${Harmony.compBackgroundSecondary.dark})`,
};

/** logcat 级别板：复用官方 brand / confirm / alert / warning + 文本四级。
 *  排出 `--yohu-level-*`；日志行经 `levelKey` → `data-level` → `--yohu-log-ink` 消费，禁止模块另起色表。 */
export const LogLevelLight = {
  v: Harmony.fontTertiary.light,
  d: Harmony.brand.light,
  i: Harmony.confirm.light,
  w: Harmony.alert.light,
  e: Harmony.warning.light,
  f: Harmony.fontOnPrimary.light,
  fBg: Harmony.warning.light,
} as const;

export const LogLevelDark = {
  v: Harmony.fontTertiary.dark,
  d: Harmony.brand.dark,
  i: Harmony.confirm.dark,
  w: Harmony.alert.dark,
  e: Harmony.warning.dark,
  f: Harmony.fontOnPrimary.dark,
  fBg: Harmony.warning.dark,
} as const;

/**
 * YoFileIcon 组件板：每字形 body（主形）+ mark（折页/细节）。
 * 全部从 Harmony primitive 派生，禁止 Material hex / 自造 10 阶。
 * 排出 `--yohu-file-icon-{glyph}` / `--yohu-file-icon-{glyph}-mark`。
 *
 * 语义：
 * - folder：目录=品牌；折页用次强调图标蓝
 * - file / text：通用稿=三级字色；折角走四级表面，行条走四级字色
 * - apk：安装包=确认绿；机器人细节走 on-primary（soft 叠在同色主形上不可见）
 * - image / video：媒体=品牌；日/山/播放三角走 on-primary
 * - audio / archive：媒体注意=警示橙；音符/条带走 on-primary
 * - xml / pdf：结构/文档=一级警示红；括号/行条走 on-primary
 * - json：数据=警示橙；花括号走各级主题正文色
 */
function fileIconBoard(mode: "light" | "dark") {
  return {
    folder: { body: Harmony.brand[mode], mark: Harmony.iconSubEmphasize[mode] },
    file: { body: Harmony.fontTertiary[mode], mark: Harmony.backgroundFourth[mode] },
    text: { body: Harmony.fontTertiary[mode], mark: Harmony.fontFourth[mode] },
    apk: { body: Harmony.confirm[mode], mark: Harmony.fontOnPrimary[mode] },
    image: { body: Harmony.brand[mode], mark: Harmony.fontOnPrimary[mode] },
    video: { body: Harmony.brand[mode], mark: Harmony.fontOnPrimary[mode] },
    audio: { body: Harmony.alert[mode], mark: Harmony.fontOnPrimary[mode] },
    archive: { body: Harmony.alert[mode], mark: Harmony.fontOnPrimary[mode] },
    xml: { body: Harmony.warning[mode], mark: Harmony.fontOnPrimary[mode] },
    pdf: { body: Harmony.warning[mode], mark: Harmony.fontOnPrimary[mode] },
    json: { body: Harmony.alert[mode], mark: Harmony.fontPrimary[mode] },
  } as const;
}

export const FileIconLight = fileIconBoard("light");
export const FileIconDark = fileIconBoard("dark");
export type FileIconGlyphName = keyof typeof FileIconLight;
