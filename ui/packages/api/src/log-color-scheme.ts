/**
 * 日志清单内容配色方案表。
 * 身份在 wire（settings.log_color_scheme）；画法在模块 editor/format 引擎；色值在 YoUI token 板。
 * 设置项与清单只认本表，禁止各写一份 id / 文案。
 */

export type LogColorScheme = "yohu" | "logcat";

export const LOG_COLOR_SCHEME_DEFAULT: LogColorScheme = "yohu";

export const LOG_COLOR_SCHEME_CATALOG: readonly {
  value: LogColorScheme;
  label: string;
  description: string;
}[] = [
  {
    value: "yohu",
    label: "Yohu（默认）",
    description: "鸿蒙语义级别色：消息、级别字、Tag 同色。",
  },
  {
    value: "logcat",
    label: "LogCat",
    description: "官方 Android Studio Logcat V2：消息按级别着色，Tag 分色。",
  },
];

export function isLogColorScheme(value: unknown): value is LogColorScheme {
  return typeof value === "string" && LOG_COLOR_SCHEME_CATALOG.some((item) => item.value === value);
}
