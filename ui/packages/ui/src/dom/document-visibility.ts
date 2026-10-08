/**
 * Page Visibility。
 * hidden 与 visible 是两档；prerender 两头都不是。
 * 布尔 hidden 只等于 hidden，不再另判。
 */

export function documentIsHidden(doc: Document | undefined = globalDocument()): boolean {
  return doc?.visibilityState === "hidden";
}

export function documentIsVisible(doc: Document | undefined = globalDocument()): boolean {
  return doc?.visibilityState === "visible";
}

function globalDocument(): Document | undefined {
  return typeof document === "undefined" ? undefined : document;
}
