/**
 * 命令库树的停留开合。
 * 设置投影在 @yohu/api；这里只对账「这次停留里用户又开合过哪些组」。
 */

import { libraryExpandGroupIds, type LibraryExpand } from "@yohu/api";

const GROUP_KEY_PREFIX = "g:";

export function libraryGroupKey(id: string): string {
  return GROUP_KEY_PREFIX + id;
}

export function libraryGroupId(key: string): string | undefined {
  if (!key.startsWith(GROUP_KEY_PREFIX)) return undefined;
  const id = key.slice(GROUP_KEY_PREFIX.length);
  if (id.length === 0) return undefined;
  return id;
}

export function libraryExpandKey(policy: LibraryExpand): string {
  return JSON.stringify([policy.mode, policy.ids]);
}

/**
 * 策略变了就按策略重铺。策略没变时：还在库里的组保留停留开合，新组按策略补，消失的组丢掉。
 */
export function nextLibraryOpenIds(
  session: ReadonlySet<string>,
  previousIds: readonly string[],
  nextIds: readonly string[],
  policy: LibraryExpand,
  policyChanged: boolean,
): Set<string> {
  if (policyChanged) return new Set(libraryExpandGroupIds(policy, nextIds));
  const seeded = new Set(libraryExpandGroupIds(policy, nextIds));
  const prev = new Set(previousIds);
  const next = new Set<string>();
  for (const id of nextIds) {
    if (!prev.has(id)) {
      if (seeded.has(id)) next.add(id);
      continue;
    }
    if (session.has(id)) next.add(id);
  }
  return next;
}

export function toggleLibraryOpenId(session: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(session);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
