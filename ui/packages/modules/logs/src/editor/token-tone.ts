/**
 * 日志着色调。格式器写入 range、着色模型读取 range，都认这一份。
 * 着色面 kind（mark / ink / wash）是另一份联合。
 */

export type TokenTone = "plain" | "ink" | "wash";

export function tokenToneIsPlain(tone: TokenTone | undefined): tone is "plain" {
  return tone === "plain";
}

export function tokenToneIsInk(tone: TokenTone | undefined): tone is "ink" {
  return tone === "ink";
}

export function tokenToneIsWash(tone: TokenTone | undefined): tone is "wash" {
  return tone === "wash";
}
