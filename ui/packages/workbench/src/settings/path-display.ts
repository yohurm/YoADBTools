/**
 * 设置页路径展示：空值回退到 system.info 解析出的绝对路径。
 */

/** 已配置值优先，否则用解析出的绝对路径。 */
export function effectivePath(value: string, fallback: string): string {
  const v = value.trim();
  return v.length > 0 ? v : fallback;
}
