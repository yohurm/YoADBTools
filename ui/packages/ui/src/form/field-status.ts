/**
 * 输入状态。文本框和搜索框共用这一把：none / error / warning。
 * 涂装把 error、warning 原样写下，其余是 neutral。aria-invalid 只认 error。
 */
import { trueAttr } from "../dom/flag";

export type FieldStatus = "none" | "error" | "warning";
export type FieldPaintKind = "neutral" | "error" | "warning";

export const DEFAULT_FIELD_STATUS: FieldStatus = "none";

export function fieldStatusIsError(status: string | undefined): status is "error" {
  return status === "error";
}

export function fieldStatusIsWarning(status: string | undefined): status is "warning" {
  return status === "warning";
}

function fieldStatusAsWritten(status: string | undefined): status is "error" | "warning" {
  return fieldStatusIsError(status) || fieldStatusIsWarning(status);
}

/** 未写或未知值归一成 none。禁止第二套 status。 */
export function resolveFieldStatus(status?: string): FieldStatus {
  if (fieldStatusAsWritten(status)) return status;
  return DEFAULT_FIELD_STATUS;
}

/** CSS 只消费这个名字。disabled 不进涂装。 */
export function fieldPaintKind(status: FieldStatus): FieldPaintKind {
  if (fieldStatusAsWritten(status)) return status;
  return "neutral";
}

export function fieldStatusInvalid(status: FieldStatus): true | undefined {
  return trueAttr(fieldStatusIsError(status));
}
