/**
 * 日志清单长文本方案表。对照官方 Soft-Wrap。
 * 身份在 wire（settings.log_line_layout）。
 * Formatter 认 softWrap；Document 只 append；View 只按文档硬 \\n 切可视行。
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
    label: "单行（LogCat）",
    description:
      "对照 LogCat Soft-Wrap 关：硬换行写入 headerWidth 空格，无硬换行的超长行不折，超宽底栏横滑。",
  },
  {
    value: "wrap",
    label: "超宽换行",
    description: "对照 LogCat Soft-Wrap 开：文档不垫悬挂空格，续行从第 0 列起，按视口软折。",
  },
];

export function isLogLineLayout(value: unknown): value is LogLineLayout {
  return typeof value === "string" && LOG_LINE_LAYOUT_CATALOG.some((item) => item.value === value);
}
