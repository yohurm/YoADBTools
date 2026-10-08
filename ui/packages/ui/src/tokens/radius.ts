/**
 * 圆角 token（UI设计系统-v6.md §2.6）。
 * 组件内禁止硬编码圆角，一律引用这里的常量或对应 CSS 变量 `--yohu-radius-*`。
 */
export const Radius = {
  /** 0（PC 标题栏三键竖条，无圆形底板） */
  None: 0,
  /** 2px（微标 / Fatal 块） */
  TwoXs: 2,
  /** 4px（小控件） */
  Xs: 4,
  /** 8px（控件：按钮 / 输入 / ripple / 气泡） */
  Sm: 8,
  /** 16px（特殊铬：卡片 / 弹出框 / 菜单 / 通知） */
  Md: 16,
  /** 20px（阶梯保留；产品特殊铬一律用 Md） */
  Lg: 20,
  /** 32px（下拉触发钮） */
  Xl: 32,
} as const;

/** 正圆与胶囊（非 px 阶梯，CSS 侧用 --yohu-radius-full / --yohu-radius-pill）。 */
export const RadiusShape = {
  Full: "50%",
  Pill: "999px",
} as const;
