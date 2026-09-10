/**
 * 模块页眉策略（L3）。
 * 槽位显隐与宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolveChromeSpec,
  type ChromeDrop,
  type ChromeInput,
  type ChromeLayout,
} from "./chrome-model";

export interface ChromeHostAttrs {
  "data-layout": ChromeLayout;
  "data-drop": ChromeDrop | undefined;
}

export interface ChromeSlots {
  showDevice: boolean;
  showBar: boolean;
  showExtra: boolean;
}

export function chromeHostAttrs(input: ChromeInput): ChromeHostAttrs {
  const spec = resolveChromeSpec(input);
  return {
    "data-layout": spec.layout,
    "data-drop": spec.drop,
  };
}

export function resolveChromeSlots(input: ChromeInput): ChromeSlots {
  const spec = resolveChromeSpec(input);
  return {
    showDevice: spec.showDevice,
    showBar: Boolean(input.hasBar),
    showExtra: Boolean(input.hasExtra),
  };
}
