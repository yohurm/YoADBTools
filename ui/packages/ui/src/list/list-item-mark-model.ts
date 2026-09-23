/**
 * 列表项强调条（L2）。
 * 贴起边的项内选中铬，不是 YoIndicator 旅行滑块。
 * 井：宽 4vp（8 网格半步），块向内缩行圆角，落在直边上。
 * 填充：配方 selected 只动 transform（展开 spatialStretch / 收回 effectsExit）。
 * 不碰 DOM。
 */

export const LIST_ITEM_MARK_CLASS = "yohu-list-item__mark";

export const LIST_ITEM_MARK_FILL_CLASS = "yohu-list-item__mark-fill";

/** 条宽。 */
export const LIST_ITEM_MARK_WIDTH_VAR = "--yohu-space-xs";

/** 块向内缩，避开宿主 `--yohu-radius-sm` 圆弧。 */
export const LIST_ITEM_MARK_INSET_BLOCK_VAR = "--yohu-radius-sm";
