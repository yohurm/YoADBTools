/**
 * 设置数字接线：只把整段十进制整数字符串收成 JSON number。
 * 前缀截断 / 小数 / 空白等非法串原样进 settings.set，由 domain 拒绝。
 */

import type { SettingKey, SettingValue } from "@yohu/api";

const INTEGER_KEYS: ReadonlySet<SettingKey> = new Set(["devices_auto_refresh", "buffer_capacity"]);

/** 整段可选负号 + 十进制数字，不含前缀、小数、空白、科学计数。 */
const DECIMAL_INTEGER = /^-?\d+$/;

export function wireSettingValue(key: SettingKey, value: unknown): SettingValue<SettingKey> | string {
  if (typeof value === "string" && INTEGER_KEYS.has(key)) {
    if (DECIMAL_INTEGER.test(value)) {
      const n = Number(value);
      if (Number.isSafeInteger(n)) {
        return n as SettingValue<SettingKey>;
      }
    }
    return value;
  }
  return value as SettingValue<SettingKey>;
}
