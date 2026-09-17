/**
 * 模块页眉领域模型（L2）。
 * 主行永远占 control-height；功能栏 / 次行由槽位显隐，不写布局名。
 * 不碰 DOM、不画按钮。
 */

export type ChromeDrop = "ignore";

export interface ChromeInput {
  hasLeading?: boolean;
  hasBar?: boolean;
  hasExtra?: boolean;
  dropIgnore?: boolean;
}

export interface ChromeSpec {
  showLeading: boolean;
  drop: ChromeDrop | undefined;
}

export function resolveChromeSpec(input: ChromeInput): ChromeSpec {
  return {
    showLeading: Boolean(input.hasLeading),
    drop: input.dropIgnore ? "ignore" : undefined,
  };
}
