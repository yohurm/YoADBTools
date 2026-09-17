/**
 * Presence 出生态（L2）。
 * clip 配方必须从 closed（0fr / 0fr 宽）挂上，才能播 0→1。
 * 对照 Vue TransitionGroup：enter 类只加在新插入的节点，禁止一挂就是终态。
 */

export function presenceClipBornState(input: {
  when: boolean;
  usesClip: boolean;
  skipMotion: boolean;
}): "open" | "closed" {
  if (!input.when) return "closed";
  if (input.usesClip && !input.skipMotion) return "closed";
  return "open";
}
