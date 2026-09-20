/**
 * 官方 Android Studio Logcat V2 色板（与鸿蒙语义板无关）。
 * Default = 浅色，Darcula = 深色（New UI Dark 继承 Darcula）。
 * 排出 `--yohu-logcat-msg-*` / `--yohu-logcat-level-*` / `--yohu-logcat-tag-0`…`79`。
 * 模块只写 token 名，禁止再列 hex。
 */

function asRgb(hex: string): string {
  const rgb = hex.replace(/^#/, "").toUpperCase();
  if (rgb.length !== 6) {
    throw new Error(`AS Logcat RGB 须为 6 位: ${hex}`);
  }
  return `#${rgb}`;
}

function logcatSwatch(fg: string, bg: string) {
  return { fg: asRgb(fg), bg: asRgb(bg) } as const;
}

/**
 * 级别徽章（字母 fg + 底 bg）。F = Assert。
 * 来源：`logcat/resources/colorSchemes/LogcatColorSchemeDefault.xml` / `Darcula.xml`。
 */
export const LogcatLevelLight = {
  v: logcatSwatch("000000", "d6d6d6"),
  d: logcatSwatch("000000", "cfe7ff"),
  i: logcatSwatch("414d41", "e9f5e6"),
  w: logcatSwatch("000000", "f5eac1"),
  e: logcatSwatch("ffffff", "cf5b56"),
  f: logcatSwatch("ffffff", "7f0000"),
} as const;

export const LogcatLevelDark = {
  v: logcatSwatch("000000", "d6d6d6"),
  d: logcatSwatch("bbbbbb", "305d78"),
  i: logcatSwatch("e9f5e6", "6a8759"),
  w: logcatSwatch("000000", "bbb529"),
  e: logcatSwatch("000000", "cf5b56"),
  f: logcatSwatch("ffffff", "8b3c3c"),
} as const;

/** `LOGCAT_V2_MESSAGE_*`。F 与 Error 同色，不是社区紫。 */
export const LogcatMessageLight = {
  v: asRgb("000000"),
  d: asRgb("389FD6"),
  i: asRgb("59A869"),
  w: asRgb("645607"),
  e: asRgb("cd0000"),
  f: asRgb("cd0000"),
} as const;

export const LogcatMessageDark = {
  v: asRgb("bbbbbb"),
  d: asRgb("299999"),
  i: asRgb("ABC023"),
  w: asRgb("bbb529"),
  e: asRgb("ff6b68"),
  f: asRgb("ff6b68"),
} as const;

/**
 * `logcat/resources/palette/logcat-tags-palette.json`：16 族 × 5 阶前景。
 * 摊平顺序对齐 `ColorPaletteManager.getForegroundColor`：
 * `index = abs(hashCode) % 80`，族 = index % 16，阶 = floor(index / 16)。
 */
const LOGCAT_TAG_TONES = 5;

const LogcatTagFamilyLight = [
  ["414d41", "485648", "4f5f4f", "566756", "5d6f5d"],
  ["1750EB", "1349DD", "1243CA", "103CB7", "0E36A4"],
  ["A46028", "985925", "8C5122", "7F4A1F", "73431C"],
  ["008000", "007000", "006100", "005200", "004200"],
  ["7411BC", "660FA3", "570D8C", "490B75", "3A095D"],
  ["990099", "8A008A", "7A007A", "6B006B", "5C005C"],
  ["008080", "007575", "006B6B", "006161", "005757"],
  ["806E0A", "6D5E08", "5A4E07", "473D05", "342D04"],
  ["325A9C", "2D538F", "2A4C84", "264578", "223F6D"],
  ["00627A", "00566B", "00495C", "003D4D", "00313D"],
  ["871094", "760E81", "650C6F", "540A5C", "43084A"],
  ["996600", "8A5C00", "7A5200", "6B4700", "5C3D00"],
  ["3F67A6", "385B94", "315081", "2A446F", "23395C"],
  ["5E7F24", "557321", "4C671D", "435B1A", "3B5016"],
  ["B24DB2", "A446A4", "964096", "883A88", "793479"],
  ["1E7BB8", "1B6FA7", "186395", "155884", "134C72"],
] as const;

const LogcatTagFamilyDark = [
  ["929292", "A3A3A3", "B5B5B5", "C7C7C7", "D9D9D9"],
  ["A9B7C6", "B9C4D0", "C8D1DA", "D7DEE4", "E7EAEF"],
  ["D28546", "D7935B", "DCA06F", "E1AE84", "E6BB98"],
  ["A8C023", "C0D930", "C9DF4E", "D2E46C", "DBEA8B"],
  ["AE8ABE", "B999C7", "C4A9D0", "D0BAD9", "DBCAE2"],
  ["D27981", "D6858B", "DA9096", "DE9CA1", "E2A7AC"],
  ["3AA192", "41B4A3", "4FBFAF", "62C6B7", "74CDC0"],
  ["FFC66D", "FFBB4D", "FFAF2E", "FFA30F", "F09400"],
  ["029CDE", "02AEF7", "17B8FD", "30BFFD", "49C7FD"],
  ["19A492", "1BB19D", "1DBFA9", "1ECCB5", "20D9C1"],
  ["A388B4", "AB91BA", "B29BC0", "B9A4C6", "C0ADCC"],
  ["B78A57", "BD9465", "C39E74", "C9A882", "D0B290"],
  ["7292CA", "819ECF", "90A9D5", "9FB5DB", "AEC0E0"],
  ["BBB529", "B4AF27", "ABA726", "A39F24", "9B9722"],
  ["D36FB1", "D77EBA", "DC8EC2", "E19DCB", "E6ADD3"],
  ["4291FF", "579DFF", "6BA9FF", "80B5FF", "94C1FF"],
] as const;

function flattenLogcatTags(families: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (let tone = 0; tone < LOGCAT_TAG_TONES; tone += 1) {
    for (const family of families) {
      const ink = family[tone];
      if (ink === undefined) {
        throw new Error(`Logcat tag 族缺第 ${tone} 阶`);
      }
      out.push(asRgb(ink));
    }
  }
  return out;
}

export const LogcatTagLight = flattenLogcatTags(LogcatTagFamilyLight);
export const LogcatTagDark = flattenLogcatTags(LogcatTagFamilyDark);

/** 排出 `--yohu-logcat-*`。主题生成器只展开，不在 emit-theme 再写官方变量名。 */
export function logcatThemeVars(
  messages: typeof LogcatMessageLight,
  levels: typeof LogcatLevelLight,
  tags: readonly string[],
): Array<[string, string]> {
  const msg = (Object.entries(messages) as Array<[string, string]>).map(
    ([key, ink]) => [`--yohu-logcat-msg-${key}`, ink] as [string, string],
  );
  const badges = (Object.entries(levels) as Array<[string, { fg: string; bg: string }]>).flatMap(
    ([key, swatch]) =>
      [
        [`--yohu-logcat-level-${key}`, swatch.fg],
        [`--yohu-logcat-level-${key}-bg`, swatch.bg],
      ] as Array<[string, string]>,
  );
  return [...msg, ...badges, ...tags.map((ink, index) => [`--yohu-logcat-tag-${index}`, ink] as [string, string])];
}
