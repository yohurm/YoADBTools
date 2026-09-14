/**
 * 命令块步间间隔展示文案。常量在 @yohu/api；标签不进 IPC 门面。
 */

export function commandBlockGapLabel(ms: number): string {
  if (ms === 0) return "无";
  if (ms % 1000 === 0) return `${ms / 1000} 秒`;
  return `${ms} 毫秒`;
}
