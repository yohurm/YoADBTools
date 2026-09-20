/**
 * 模块页眉领域模型（L2）。
 * 主行永远占 control-height；功能栏 / 次行 / leading 由规格显隐，不写布局名。
 * 功能栏项只认身份 key；进出场在 L4 走 Presence chip。
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
  showBar: boolean;
  showExtra: boolean;
  drop: ChromeDrop | undefined;
}

export interface ChromeActionRef {
  key: string;
}

export function resolveChromeSpec(input: ChromeInput): ChromeSpec {
  return {
    showLeading: Boolean(input.hasLeading),
    showBar: Boolean(input.hasBar),
    showExtra: Boolean(input.hasExtra),
    drop: input.dropIgnore ? "ignore" : undefined,
  };
}

/** 有身份项才开功能栏意图。空数组与缺省一样关槽。 */
export function chromeHasBar(actions: readonly ChromeActionRef[] | undefined): boolean {
  return (actions?.length ?? 0) > 0;
}
