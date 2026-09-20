/**
 * 模块页眉策略（L3）。
 * 槽位显隐与宿主 data-* 从模型快照组装。
 * 不写色值、不画铬。
 */

import {
  resolveChromeSpec,
  type ChromeDrop,
  type ChromeInput,
} from "./chrome-model";

export interface ChromeHostAttrs {
  "data-drop": ChromeDrop | undefined;
}

export interface ChromeSlots {
  showLeading: boolean;
  showBar: boolean;
  showExtra: boolean;
}

export function chromeHostAttrs(input: ChromeInput): ChromeHostAttrs {
  const spec = resolveChromeSpec(input);
  return {
    "data-drop": spec.drop,
  };
}

export function resolveChromeSlots(input: ChromeInput): ChromeSlots {
  const spec = resolveChromeSpec(input);
  return {
    showLeading: spec.showLeading,
    showBar: spec.showBar,
    showExtra: spec.showExtra,
  };
}
