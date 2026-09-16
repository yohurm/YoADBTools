/** 全局错误必须带上位置和栈；只记 message 会把渲染链抛错收成无法对账的黑屏。 */
export function formatWindowError(
  e: Pick<ErrorEvent, "message" | "filename" | "lineno" | "colno" | "error">,
): string {
  const where = [e.filename, e.lineno, e.colno]
    .filter((part) => part !== undefined && part !== null && part !== "" && part !== 0)
    .join(":");
  const stack = e.error instanceof Error && e.error.stack ? `\n${e.error.stack}` : "";
  return `JS: ${e.message}${where ? ` @ ${where}` : ""}${stack}`;
}
