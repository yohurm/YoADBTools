/**
 * Presence 出生态（L2）。
 * transition 配方必须从 closed 挂上，才能播位移/透明度且可打断。
 * clip（list/chip）额外从 0fr 起步；toast 无裁切盒，只延迟 open。
 * 对照 Vue TransitionGroup：enter 只加在新插入的节点，禁止一挂就是终态。
 */

export function presenceBornState(input: {
  when: boolean;
  delayOpen: boolean;
  skipMotion: boolean;
}): "open" | "closed" {
  if (!input.when) return "closed";
  if (input.delayOpen && !input.skipMotion) return "closed";
  return "open";
}
