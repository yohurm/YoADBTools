/**
 * YoIconButton —— 图标按钮（L4 视图）。
 * 尺寸 / 禁用由 icon-button-model + icon-button-policy 决定；本文件只绑属性与内容区。
 * 透明底，不是 YoButton 的 variant。加载旋转走 tokens/motion.css 的 yohu-spin。
 */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import type { YoIconButtonSize } from "./icon-button-model";
import { iconButtonHostAttrs } from "./icon-button-policy";
import { YoTooltip } from "./Tooltip";
import "./IconButton.css";

export type { YoIconButtonSize };

export interface YoIconButtonProps {
  /** 具名图标。有 children 时只作缺省内容 */
  icon?: IconName;
  /** 自定义内容区（主题钮字形叠层等） */
  children?: JSX.Element;
  /** 无障碍名；可见提示走 YoTooltip，禁止再写原生 title 属性 */
  title?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 加载中：内容区图标按 `--yohu-dur-loop` 旋转 */
  loading?: boolean;
  /** 控件尺寸。禁止传 px */
  size?: YoIconButtonSize;
  /** 点击回调 */
  onClick?: (event: MouseEvent) => void;
  /** 展开控件（侧栏等） */
  "aria-expanded"?: boolean;
  /** 无障碍按下态（可不带视觉 pressed） */
  "aria-pressed"?: boolean;
  /** 切换按下铬（仅显示等） */
  pressed?: boolean;
}

/** 渲染透明底图标钮。内容区 = 具名图标或 slot，圆角内裁剪。 */
export function YoIconButton(props: YoIconButtonProps): JSX.Element {
  const host = createMemo(() =>
    iconButtonHostAttrs({
      size: props.size,
      hasIcon: props.icon != null,
      hasSlot: props.children != null,
      disabled: props.disabled,
      loading: props.loading,
      pressed: props.pressed,
      ariaPressed: props["aria-pressed"],
    }),
  );

  const button = (
    <button
      type="button"
      class="yohu-icon-button yohu-focus-ring"
      data-size={host()["data-size"]}
      data-pressed={host()["data-pressed"]}
      data-busy={host()["data-busy"]}
      aria-label={props.title}
      aria-busy={host()["aria-busy"]}
      aria-expanded={props["aria-expanded"]}
      aria-pressed={host()["aria-pressed"]}
      disabled={host().disabled}
      onClick={props.onClick}
    >
      {props.children ?? (props.icon ? <Icon name={props.icon} /> : null)}
    </button>
  );
  return props.title ? (
    <YoTooltip content={props.title} disabled={Boolean(host().disabled)}>
      {button}
    </YoTooltip>
  ) : (
    button
  );
}
