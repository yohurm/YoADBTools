/**
 * 日志清单长文本方案表。
 * 身份在 wire（settings.log_line_layout）；画法只在模块 editor/view。
 * Formatter / Document 禁止认本表。设置项与清单只认本表，禁止各写一份 id / 文案。
 */

export type LogLineLayout = "clip" | "wrap";

export const LOG_LINE_LAYOUT_DEFAULT: LogLineLayout = "clip";

export const LOG_LINE_LAYOUT_CATALOG: readonly {
  value: LogLineLayout;
  label: string;
  description: string;
}[] = [
  {
    value: "clip",
    label: "单行（LogCat，默认）",
    description: "对照 LogCat Soft-Wrap 关：不按视口折，硬换行仍切行，超宽底栏横滑。",
  },
  {
    value: "wrap",
    label: "超宽换行",
    description: "只折消息；前缀不拆，续行悬挂对齐消息列。",
  },
];

export const LOG_LINE_LAYOUT_HINT = LOG_LINE_LAYOUT_CATALOG.map((item) => item.description).join(" ");

export function isLogLineLayout(value: unknown): value is LogLineLayout {
  return typeof value === "string" && LOG_LINE_LAYOUT_CATALOG.some((item) => item.value === value);
}
