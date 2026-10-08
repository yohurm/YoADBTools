/** 全局错误必须带上位置和栈；只记 message 会把渲染链抛错收成无法对账的黑屏。 */
function thrown(e: Pick<ErrorEvent, "error">): unknown {
  return e.error;
}

function stackOf(error: Error): string | undefined {
  return error.stack;
}

export function formatWindowError(
  e: Pick<ErrorEvent, "message" | "filename" | "lineno" | "colno" | "error">,
): string {
  const where = [e.filename, e.lineno, e.colno]
    .filter((part) => part !== undefined && part !== null && part !== "" && part !== 0)
    .join(":");
  const err = thrown(e);
  const traced = err instanceof Error ? stackOf(err) : undefined;
  const stack = traced ? `\n${traced}` : "";
  return `JS: ${e.message}${where ? ` @ ${where}` : ""}${stack}`;
}
