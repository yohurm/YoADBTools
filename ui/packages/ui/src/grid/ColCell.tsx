/**
 * YoColCell —— 清单体单元格。
 * 列垫与表头同一条 `--yohu-col-cell-pad`（由 YoColFrame 写入）。
 */
import { splitProps, type JSX } from "solid-js";
import "./ColCell.css";

export type YoColCellProps = JSX.HTMLAttributes<HTMLSpanElement> & {
  /** 解析失败等通栏：占满整条轨道，不改 template */
  span?: boolean;
};

export function YoColCell(props: YoColCellProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "classList", "span"]);
  return (
    <span
      {...rest}
      class={`yohu-col-cell${local.class ? ` ${local.class}` : ""}`}
      classList={local.classList}
      data-span={local.span ? "" : undefined}
    />
  );
}
