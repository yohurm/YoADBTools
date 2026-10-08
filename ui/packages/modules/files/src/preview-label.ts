/** 预览分区的标题和收起句。页眉按钮和预览栏共用。 */

export const PREVIEW_TITLE = "预览";
export const PREVIEW_COLLAPSE = "收起预览";

export function previewToggleLabel(open: boolean): string {
  return open ? PREVIEW_COLLAPSE : PREVIEW_TITLE;
}

/** 预览缺值。非文件的体积和空的修改时间都用这一笔。 */
export function previewEmptyDetail(): string {
  return "—";
}
