/**
 * 模块页眉领域模型（L2）。
 * 主行永远占 control-height；功能栏 / 次行只改变布局名。
 * 不碰 DOM、不画按钮。
 */

export type ChromeLayout = "title" | "title-bar" | "title-extra" | "title-bar-extra";
export type ChromeDrop = "ignore";

export interface ChromeInput {
  deviceLabel?: string;
  hasBar?: boolean;
  hasExtra?: boolean;
  dropIgnore?: boolean;
}

export interface ChromeSpec {
  layout: ChromeLayout;
  showDevice: boolean;
  drop: ChromeDrop | undefined;
}

export function resolveChromeLayout(input: Pick<ChromeInput, "hasBar" | "hasExtra">): ChromeLayout {
  if (input.hasBar && input.hasExtra) return "title-bar-extra";
  if (input.hasBar) return "title-bar";
  if (input.hasExtra) return "title-extra";
  return "title";
}

export function resolveChromeSpec(input: ChromeInput): ChromeSpec {
  return {
    layout: resolveChromeLayout(input),
    showDevice: Boolean(input.deviceLabel),
    drop: input.dropIgnore ? "ignore" : undefined,
  };
}
