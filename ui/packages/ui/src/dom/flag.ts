/**
 * 宿主布尔旗。data-checked / data-open 的 true|false 只在这里编码和解码。
 */

export type FlagAttr = "true" | "false";

export function flagAttr(on: boolean): FlagAttr {
  return on ? "true" : "false";
}

export function flagIsOn(flag: FlagAttr): boolean {
  return flag === "true";
}

/** 存在性旗。属性在则为开，值为空串。CSS 用 [data-x]，不比较 "true"。空串在 JS 里是假，视图用 presenceIsOn 读。 */
export function presenceAttr(on: boolean): "" | undefined {
  return on ? "" : undefined;
}

export function presenceIsOn(flag: "" | undefined): boolean {
  return flag === "";
}

/** 开着写成 true，关着省略。 */
export function trueAttr(on: boolean): true | undefined {
  return on ? true : undefined;
}

/** 区域关掉时写成 true，开着省略。折叠、揭示、轨槽的 aria-hidden / inert 都认这一把。 */
export function closedAttr(open: boolean): true | undefined {
  return trueAttr(!open);
}
