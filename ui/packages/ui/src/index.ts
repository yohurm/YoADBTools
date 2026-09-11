/**
 * @yohu/ui 组件库入口。
 * 导出全部 token、图标与公开组件（Yo* 标注）。
 * 工厂公开返回值只带模块契约；Host 队列 / 会话快照留在内部类型。
 */
import {
  YoContextMenuHost,
  closeContextMenu,
  createContextMenuController as createContextMenuHost,
  defineContextMenu,
  openContextMenu,
} from "./context-menu";
import type { ContextMenuController } from "./context-menu";
import { YoToast, YoToaster, createToaster as createToasterHost } from "./components/Toast";
import type { Toaster } from "./components/Toast";

// —— tokens ——
// 公开面只表达契约：`MotionDuration` / `MotionEasing` / `MotionSpec`、`motionDurationMs` / `motionSpecMs`。
// `MotionSpring` / `springCssEasing` 是采样实现（把欠阻尼弹簧采成 `linear()`），只被 motion 模块内部消费，
// 不进入对外导出面；消费弹簧请用 `MotionEasing.spring` / `MotionEasing.springSoft`。
export {
  Colors,
  DarkColors,
  FontSizes,
  FontSizesCompact,
  FontLeading,
  FontWeights,
  FontFamilies,
  Spacing,
  SpacingBase,
  Radius,
  RadiusShape,
  Layout,
  LayoutLimits,
  ZIndex,
  Stroke,
  FocusRing,
  Elevation,
  DarkElevation,
  Density,
  MotionDuration,
  MotionEasing,
  MotionSpec,
  motionDurationMs,
  motionSpecMs,
  StateFill,
  setTheme,
  getTheme,
  getThemePreference,
  onResolvedThemeChange,
  setDensity,
  getDensity,
} from "./tokens";
export type {
  SemanticColorName,
  ThemeName,
  ThemePreference,
  DensityName,
  MotionDurationName,
  MotionEasingName,
  MotionSpecName,
} from "./tokens";

// —— icons ——
export { Icon, ICON_NAMES } from "./icons";
export type { IconName, IconProps } from "./icons";
export { YoFileIcon } from "./file-icons";
export type { YoFileIconProps } from "./file-icons";

// —— 基础 ——
export { YoButton } from "./components/Button";
export type { YoButtonProps, YoButtonVariant, YoButtonTone, YoButtonSize } from "./components/Button";

export { YoSegmentedButton } from "./components/SegmentedButton";
export type {
  YoSegmentedButtonProps,
  YoSegmentedButtonSize,
  YoSegmentedItem,
  YoSegmentedType,
} from "./components/SegmentedButton";

export { YoIconButton } from "./components/IconButton";
export type { YoIconButtonProps } from "./components/IconButton";
export { YoThemeToggle } from "./components/ThemeToggle";
export type { YoThemeToggleProps } from "./components/ThemeToggle";

export { YoTextField } from "./components/TextField";
export type { YoTextFieldProps, YoTextFieldStatus, YoTextFieldAffix } from "./components/TextField";

export { YoSelect } from "./components/Select";
export type { YoSelectProps, YoSelectOption } from "./components/Select";

export { YoCheckbox } from "./components/Checkbox";
export type { YoCheckboxProps } from "./components/Checkbox";

export { YoSwitch } from "./components/Switch";
export type { YoSwitchProps } from "./components/Switch";

export { YoBadge } from "./components/Badge";
export type { YoBadgeProps, YoBadgeTone } from "./components/Badge";

export { YoProgressBar } from "./components/ProgressBar";
export type { YoProgressBarProps } from "./components/ProgressBar";

// —— 导航 ——
export { YoToolbar } from "./components/Toolbar";
export type { YoToolbarProps, YoToolbarPad } from "./components/Toolbar";

export { YoTabs } from "./components/Tabs";
export type { YoTabsProps, YoTabItem, YoTabDot, YoTabDotTone } from "./components/Tabs";

export { YoTree } from "./components/Tree";
export type { YoTreeProps, TreeNode } from "./components/Tree";

export { YoVirtualList } from "./components/VirtualList";
export type { YoVirtualListProps, YoVirtualListTone } from "./components/VirtualList";

export { YoColResizer } from "./components/ColResizer";
export type { YoColResizerProps } from "./components/ColResizer";

export { YoColHeader } from "./components/ColHeader";
export type { YoColHeaderProps, YoColHeaderAlign, YoColHeaderSort } from "./components/ColHeader";

export { YoColFrame } from "./components/ColFrame";
export type { YoColFrameProps, YoColCellPad } from "./components/ColFrame";

export { YoColRow } from "./components/ColRow";
export type { YoColRowProps } from "./components/ColRow";

export { YoColTrack } from "./components/ColTrack";
export type { YoColTrackProps } from "./components/ColTrack";

export { YoColCell } from "./components/ColCell";
export type { YoColCellProps } from "./components/ColCell";

export {
  colTrackTemplate,
  defaultColWidths,
  setColWidth,
} from "./components/col-model";
export type { YoColSpec, YoColWidths } from "./components/col-model";

export { YoPanel } from "./components/Panel";
export type {
  YoPanelProps,
  YoPanelAlign,
  YoPanelGap,
  YoPanelOverflow,
  YoPanelPadding,
  YoPanelVariant,
} from "./components/Panel";

export { YoPage } from "./components/Page";
export type { YoPageProps } from "./components/Page";

export { YoFormRow } from "./components/FormRow";
export type { YoFormRowProps } from "./components/FormRow";

// —— 键盘作用域（L1；页面提供绑定表） ——
export {
  adjacentJoin,
  allKeys,
  attachPanelKeys,
  eventKey,
  isActionableTarget,
  isCommandModifier,
  isEditableTarget,
  isInside,
  isModKey,
  matchBindings,
  matchesChord,
  modPlatform,
  nextKeys,
  panelKeyContext,
  pointerSelectMode,
  whenIdle,
  whenList,
  whenPanel,
  whenPanelOrField,
} from "./keymap";
export type {
  KeyBinding,
  KeyChord,
  ModifierPlatform,
  PanelKeyContext,
  PanelKeyHost,
  PanelKeyOwnership,
  PanelScopeOptions,
  SelectJoin,
  SelectMode,
} from "./keymap";

// —— 反馈 ——
export { YoEmptyState } from "./components/EmptyState";
export type { YoEmptyStateProps } from "./components/EmptyState";

export { YoLoading } from "./components/Loading";
export type { YoLoadingProps } from "./components/Loading";

export { YoDialog } from "./components/Dialog";
export type { YoDialogProps, YoDialogBodyLayout, YoDialogBodyOverflow, YoDialogBodyPad } from "./components/Dialog";

export { YoTooltip, YoTooltipHost } from "./components/Tooltip";
export type { YoTooltipProps, YoTooltipHostProps } from "./components/Tooltip";

// —— 右键菜单（L1；页面提供场景表，壳挂唯一 Host；YoContextMenu 仅 Host 内部使用） ——
// 默认单例只被 Host 内部读取，不从此处导出。
// 页面/模块走 `openContextMenu` / `closeContextMenu`；独立实例用工厂。
export {
  YoContextMenuHost,
  closeContextMenu,
  defineContextMenu,
  openContextMenu,
};
export const createContextMenuController: () => ContextMenuController = createContextMenuHost;
export type {
  ContextMenuController,
  ContextMenuRequest,
  ContextMenuScene,
  YoContextMenuHostProps,
  YoMenuItem,
} from "./context-menu";

export { YoToast, YoToaster };
export const createToaster: () => Toaster = createToasterHost;
export type { ToastTone, Toaster, YoToastProps, YoToasterProps } from "./components/Toast";

export {
  YoPresence,
  YoListPresence,
  YoCollapse,
  YoSwap,
  YoIndicator,
  prefersReducedMotion,
  shouldSkipMotion,
  DISMISS_HOLD_DURATION,
} from "./motion";
export type {
  YoPresenceProps,
  YoListPresenceProps,
  YoCollapseProps,
  CollapseRecipe,
  YoSwapProps,
  YoIndicatorProps,
  IndicatorVariant,
  PresenceRecipe,
} from "./motion";

// —— 窗口铬 ——
export { YoChrome } from "./components/chrome";
export type { YoChromeProps } from "./components/chrome";
export { YoTitleBar } from "./components/TitleBar";
export type { YoTitleBarProps } from "./components/TitleBar";

export { YoStatusBar } from "./components/StatusBar";
export type { YoStatusBarProps } from "./components/StatusBar";
