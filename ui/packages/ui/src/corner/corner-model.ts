/**
 * 圆角绘制（L2）。
 * HarmonyOS 圆弧：四分之一圆（官方「圆角半径控制圆弧曲率」），不是超椭圆。
 * 描边整条落在外侧半径内侧（与投屏 HWND `stroke_frame` 同一 inset），
 * 禁止 CSS `border` + `overflow:hidden` 叠两层抗锯齿出毛边。
 * 电脑角色半径仍走 token 阶梯：控件 8、卡片/弹出框 16（手机弹出框 32 / 按钮 20 的 PC 收敛）。
 */
import { Radius } from "../tokens/radius";

export type CornerRole = "control" | "card" | "dialog";

export interface CornerRadii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

export interface CornerPaintInput {
  width: number;
  height: number;
  role?: CornerRole;
  radius?: number;
  radii?: Partial<CornerRadii>;
  stroke?: number;
  /** 外圈中心线相对填充盒的外扩。0 不画外圈。禁止与 fill / stroke 共用路径。 */
  edgeOutset?: number;
}

export interface CornerPaint {
  width: number;
  height: number;
  radii: CornerRadii;
  fillPath: string;
  strokePath: string;
  edgePath: string;
  clipPath: string;
  viewBox: string;
}

const DEFAULT_CORNER_ROLE: CornerRole = "card";

/** 胶囊：半径大于短边一半，clamp 后成 pill。CSS 仍走 `--yohu-radius-pill`。 */
export const CornerPillRadius = 999;

/** PC 对照鸿蒙：电脑更小圆角，仍保持层级正相关（弹出框 ≥ 卡片 > 按钮）。 */
export function cornerRadiusForRole(role: CornerRole): number {
  switch (role) {
    case "control":
      return Radius.Sm;
    case "card":
    case "dialog":
      return Radius.Md;
  }
}

export function uniformCornerRadii(radius: number): CornerRadii {
  const r = Math.max(0, radius);
  return { tl: r, tr: r, br: r, bl: r };
}

export function mergeCornerRadii(base: number, override?: Partial<CornerRadii>): CornerRadii {
  const uniform = uniformCornerRadii(base);
  if (!override) return uniform;
  return {
    tl: override.tl ?? uniform.tl,
    tr: override.tr ?? uniform.tr,
    br: override.br ?? uniform.br,
    bl: override.bl ?? uniform.bl,
  };
}

/**
 * CSS Backgrounds 邻接圆角缩放：两侧半径之和超过边长时按同一系数缩小。
 * 禁止只 clamp 到 min(w,h)/2，否则相邻大圆角会互相穿帮。
 */
export function clampCornerRadii(width: number, height: number, radii: CornerRadii): CornerRadii {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const tl = Math.max(0, radii.tl);
  const tr = Math.max(0, radii.tr);
  const br = Math.max(0, radii.br);
  const bl = Math.max(0, radii.bl);
  const factors = [1];
  if (tl + tr > 0) factors.push(w / (tl + tr));
  if (bl + br > 0) factors.push(w / (bl + br));
  if (tl + bl > 0) factors.push(h / (tl + bl));
  if (tr + br > 0) factors.push(h / (tr + br));
  const raw = Math.min(...factors);
  const scale = Number.isFinite(raw) && raw < 1 ? raw : 1;
  return { tl: tl * scale, tr: tr * scale, br: br * scale, bl: bl * scale };
}

export function insetCornerRadii(radii: CornerRadii, inset: number): CornerRadii {
  const step = Math.max(0, inset);
  return {
    tl: Math.max(0, radii.tl - step),
    tr: Math.max(0, radii.tr - step),
    br: Math.max(0, radii.br - step),
    bl: Math.max(0, radii.bl - step),
  };
}

/** 外扩后半径随中心线一起变大，保持同心四分之一圆。 */
export function outsetCornerRadii(radii: CornerRadii, outset: number): CornerRadii {
  const step = Math.max(0, outset);
  return {
    tl: radii.tl + step,
    tr: radii.tr + step,
    br: radii.br + step,
    bl: radii.bl + step,
  };
}

/**
 * 外圈中心线：空隙（盒边 → 描边内沿）+ 半宽。
 * 与 inset 描边环对偶：stroke 在盒内，edge 在盒外。
 */
export function cornerHaloOutset(gap: number, strokeWidth: number): number {
  return Math.max(0, gap) + Math.max(0, strokeWidth) / 2;
}

/** 填充盒外侧的圆角矩形（中心线）。outset≤0 不画。 */
export function cornerEdgeHaloPath(
  width: number,
  height: number,
  radii: CornerRadii,
  outset: number,
): string {
  if (outset <= 0 || width <= 0 || height <= 0) return "";
  return roundedRectPath(
    -outset,
    -outset,
    width + outset * 2,
    height + outset * 2,
    outsetCornerRadii(radii, outset),
  );
}

export function formatCornerCoord(value: number): string {
  const snapped = Math.round(value * 1000) / 1000;
  return String(snapped);
}

function joinPath(parts: Array<string | "">): string {
  return parts.filter((part) => part.length > 0).join("");
}

/** 顺时针圆角矩形，从顶边 TL 之后起笔。 */
export function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): string {
  if (width <= 0 || height <= 0) return "";
  const r = clampCornerRadii(width, height, radii);
  const right = x + width;
  const bottom = y + height;
  const { tl, tr, br, bl } = r;
  return joinPath([
    `M${formatCornerCoord(x + tl)} ${formatCornerCoord(y)}`,
    `H${formatCornerCoord(right - tr)}`,
    tr > 0
      ? `A${formatCornerCoord(tr)} ${formatCornerCoord(tr)} 0 0 1 ${formatCornerCoord(right)} ${formatCornerCoord(y + tr)}`
      : "",
    `V${formatCornerCoord(bottom - br)}`,
    br > 0
      ? `A${formatCornerCoord(br)} ${formatCornerCoord(br)} 0 0 1 ${formatCornerCoord(right - br)} ${formatCornerCoord(bottom)}`
      : "",
    `H${formatCornerCoord(x + bl)}`,
    bl > 0
      ? `A${formatCornerCoord(bl)} ${formatCornerCoord(bl)} 0 0 1 ${formatCornerCoord(x)} ${formatCornerCoord(bottom - bl)}`
      : "",
    `V${formatCornerCoord(y + tl)}`,
    tl > 0
      ? `A${formatCornerCoord(tl)} ${formatCornerCoord(tl)} 0 0 1 ${formatCornerCoord(x + tl)} ${formatCornerCoord(y)}`
      : "",
    "Z",
  ]);
}

/** 逆时针，给 evenodd 描边环挖洞。 */
export function roundedRectPathCcw(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): string {
  if (width <= 0 || height <= 0) return "";
  const r = clampCornerRadii(width, height, radii);
  const right = x + width;
  const bottom = y + height;
  const { tl, tr, br, bl } = r;
  return joinPath([
    `M${formatCornerCoord(x + tl)} ${formatCornerCoord(y)}`,
    tl > 0
      ? `A${formatCornerCoord(tl)} ${formatCornerCoord(tl)} 0 0 0 ${formatCornerCoord(x)} ${formatCornerCoord(y + tl)}`
      : "",
    `V${formatCornerCoord(bottom - bl)}`,
    bl > 0
      ? `A${formatCornerCoord(bl)} ${formatCornerCoord(bl)} 0 0 0 ${formatCornerCoord(x + bl)} ${formatCornerCoord(bottom)}`
      : "",
    `H${formatCornerCoord(right - br)}`,
    br > 0
      ? `A${formatCornerCoord(br)} ${formatCornerCoord(br)} 0 0 0 ${formatCornerCoord(right)} ${formatCornerCoord(bottom - br)}`
      : "",
    `V${formatCornerCoord(y + tr)}`,
    tr > 0
      ? `A${formatCornerCoord(tr)} ${formatCornerCoord(tr)} 0 0 0 ${formatCornerCoord(right - tr)} ${formatCornerCoord(y)}`
      : "",
    `H${formatCornerCoord(x + tl)}`,
    "Z",
  ]);
}

export function cornerStrokeRingPath(
  width: number,
  height: number,
  radii: CornerRadii,
  stroke: number,
): string {
  if (stroke <= 0 || width <= 0 || height <= 0) return "";
  const outer = clampCornerRadii(width, height, radii);
  const innerW = width - stroke * 2;
  const innerH = height - stroke * 2;
  const outerPath = roundedRectPath(0, 0, width, height, outer);
  if (innerW <= 0 || innerH <= 0) return outerPath;
  return `${outerPath}${roundedRectPathCcw(stroke, stroke, innerW, innerH, insetCornerRadii(outer, stroke))}`;
}

export function cssCornerPath(d: string): string {
  return d.length > 0 ? `path('${d}')` : "none";
}

/** 闭圆盘含边。与启动表面 `in_round_rect` 同一四分之一圆判定。 */
export function pointInRoundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: CornerRadii,
): boolean {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  const r = clampCornerRadii(width, height, radii);
  if (x < r.tl && y < r.tl) {
    const dx = x - r.tl;
    const dy = y - r.tl;
    return dx * dx + dy * dy <= r.tl * r.tl;
  }
  if (x > width - r.tr && y < r.tr) {
    const dx = x - (width - r.tr);
    const dy = y - r.tr;
    return dx * dx + dy * dy <= r.tr * r.tr;
  }
  if (x > width - r.br && y > height - r.br) {
    const dx = x - (width - r.br);
    const dy = y - (height - r.br);
    return dx * dx + dy * dy <= r.br * r.br;
  }
  if (x < r.bl && y > height - r.bl) {
    const dx = x - r.bl;
    const dy = y - (height - r.bl);
    return dx * dx + dy * dy <= r.bl * r.bl;
  }
  return true;
}

export function resolveCornerPaint(input: CornerPaintInput): CornerPaint {
  const width = Math.max(0, input.width);
  const height = Math.max(0, input.height);
  const radius = input.radius ?? cornerRadiusForRole(input.role ?? DEFAULT_CORNER_ROLE);
  const stroke = Math.max(0, input.stroke ?? 0);
  const radii = clampCornerRadii(width, height, mergeCornerRadii(radius, input.radii));
  const empty = width <= 0 || height <= 0;
  const fillPath = empty ? "" : roundedRectPath(0, 0, width, height, radii);
  const strokePath = empty ? "" : cornerStrokeRingPath(width, height, radii, stroke);
  const edgePath = empty ? "" : cornerEdgeHaloPath(width, height, radii, Math.max(0, input.edgeOutset ?? 0));
  const clipRadii = stroke > 0 ? insetCornerRadii(radii, stroke) : radii;
  const clipW = width - stroke * 2;
  const clipH = height - stroke * 2;
  const clipD =
    empty || clipW <= 0 || clipH <= 0
      ? fillPath
      : roundedRectPath(stroke, stroke, clipW, clipH, clipRadii);
  return {
    width,
    height,
    radii,
    fillPath,
    strokePath,
    edgePath,
    clipPath: cssCornerPath(clipD),
    viewBox: empty ? "0 0 1 1" : `0 0 ${formatCornerCoord(width)} ${formatCornerCoord(height)}`,
  };
}
