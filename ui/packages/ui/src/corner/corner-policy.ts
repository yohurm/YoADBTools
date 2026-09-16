/**
 * 圆角绘制策略（L3）。
 * 角色半径与描边宽从模型/token 取；本文件只装配宿主契约。
 */
import { Stroke } from "../tokens/layout";
import { cornerRadiusForRole, type CornerRole } from "./corner-model";

export type YoCornerMode = "host" | "paint";

export interface CornerHostInput {
  role?: CornerRole;
  radius?: number;
  stroke?: boolean;
  clip?: boolean;
  mode?: YoCornerMode;
}

export interface CornerHostSpec {
  role: CornerRole;
  radius: number;
  stroke: number;
  clip: boolean;
  mode: YoCornerMode;
}

const DEFAULT_CORNER_ROLE: CornerRole = "card";
const DEFAULT_CORNER_MODE: YoCornerMode = "host";

/** host 默认画描边并裁内容；paint 只铺在已有宿主上，默认不描边。 */
export function resolveCornerHostSpec(input: CornerHostInput): CornerHostSpec {
  const role = input.role ?? DEFAULT_CORNER_ROLE;
  const mode = input.mode ?? DEFAULT_CORNER_MODE;
  const strokeOn = input.stroke ?? mode === "host";
  return {
    role,
    radius: input.radius ?? cornerRadiusForRole(role),
    stroke: strokeOn ? Stroke.Hairline : 0,
    clip: input.clip ?? mode === "host",
    mode,
  };
}
