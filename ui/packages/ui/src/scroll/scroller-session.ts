/**
 * 滚轴偏移会话（L3）。数字偏移是唯一源；不碰 DOM、不画铬、不进 Solid。
 * 声明尺走 offset 驱动：视口 scrollTop 恒 0，内容平面 transform。
 * 无声明尺走 flow：调用方把同一数字写进 scrollTop。
 */

import {
  resolveScrollerClampedTop,
  type ScrollerMetrics,
} from "./scroller-model";

export interface ScrollerOffset {
  block: number;
  inline: number;
}

export interface ScrollerSession {
  offset: () => ScrollerOffset;
  metrics: () => ScrollerMetrics;
  setMetrics: (next: ScrollerMetrics) => void;
  moveTo: (block: number, inline?: number) => ScrollerOffset;
  moveBy: (dBlock: number, dInline?: number) => ScrollerOffset;
  reclamp: () => ScrollerOffset;
  destroy: () => void;
}

export function createScrollerSession(): ScrollerSession {
  let block = 0;
  let inline = 0;
  const metrics: ScrollerMetrics = {
    viewBlock: 0,
    contentBlock: 0,
    viewInline: 0,
    contentInline: 0,
  };

  const clamp = (nextBlock: number, nextInline: number): ScrollerOffset => {
    block = resolveScrollerClampedTop({
      top: nextBlock,
      view: metrics.viewBlock,
      all: metrics.contentBlock,
    });
    inline = resolveScrollerClampedTop({
      top: nextInline,
      view: metrics.viewInline,
      all: metrics.contentInline,
    });
    return { block, inline };
  };

  return {
    offset: () => ({ block, inline }),
    metrics: () => metrics,
    setMetrics: (next) => {
      metrics.viewBlock = next.viewBlock;
      metrics.contentBlock = next.contentBlock;
      metrics.viewInline = next.viewInline;
      metrics.contentInline = next.contentInline;
    },
    moveTo: (nextBlock, nextInline = inline) => clamp(nextBlock, nextInline),
    moveBy: (dBlock, dInline = 0) => clamp(block + dBlock, inline + dInline),
    reclamp: () => clamp(block, inline),
    destroy: () => {
      block = 0;
      inline = 0;
    },
  };
}
