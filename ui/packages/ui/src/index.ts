/**
 * @yohu/ui 组件库入口。
 * 导出全部 token、图标与公开组件（Yo* 标注）。
 * 源码按 HarmonyOS 族目录存放；本文件只做 L5 转发。
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
import { YoToast, YoToaster, createToaster as createToasterHost } from "./overlay/Toast";
import type { Toaster } from "./overlay/Toast";

// —— tokens ——
// 公开面只表达契约：`MotionDuration` / `MotionEasing` / `MotionSpec`、`motionDurationMs` / `motionSpecMs`。
// `MotionSpring` / `springCssEasing` 是采样实现（把欠阻尼弹簧采成 `linear()`），只被 motion 模块内部消费，
// 不进入对外导出面；消费弹簧请用 `MotionEasing.spring` / `MotionEasing.springSoft` / `MotionEasing.springGrow`。
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
  bindFocusModality,
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

// —— 按钮与选择 / 文本与输入 / 信息展示 / 空白与分隔 ——
export { YoButton } from "./basic/Button";
export type { YoButtonProps, YoButtonStyle, YoButtonTone, YoButtonSize } from "./basic/Button";

export { YoSegmentedButton } from "./basic/SegmentedButton";
export type {
  YoSegmentedButtonProps,
  YoSegmentedButtonSize,
  YoSegmentedItem,
  YoSegmentedType,
} from "./basic/SegmentedButton";

export { YoIconButton } from "./basic/IconButton";
export type { YoIconButtonProps } from "./basic/IconButton";
export { YoThemeToggle } from "./basic/ThemeToggle";
export type { YoThemeToggleProps } from "./basic/ThemeToggle";

export { YoTextField } from "./form/TextField";
export type {
  YoTextFieldProps,
  YoTextFieldStatus,
  YoTextFieldAffix,
  YoTextFieldControl,
  TextFieldWidthKind,
} from "./form/TextField";

export { YoSelect } from "./form/Select";
export type { YoSelectProps, YoSelectOption } from "./form/Select";

export { YoCheckbox } from "./basic/Checkbox";
export type { YoCheckboxProps } from "./basic/Checkbox";

export { YoSwitch } from "./basic/Switch";
export type { YoSwitchProps } from "./basic/Switch";

export { YoBadge } from "./display/Badge";
export type { YoBadgeProps, YoBadgeTone } from "./display/Badge";
export { YoChip } from "./display/Chip";
export type { YoChipProps, YoChipTone, YoChipLeading } from "./display/Chip";

export { YoStatusDot } from "./display/StatusDot";
export type { YoStatusDotProps, YoStatusDotTone } from "./display/StatusDot";

export { YoDivider } from "./blank/Divider";
export type { YoDividerProps, YoDividerOrientation } from "./blank/Divider";

export { YoSubheader } from "./list/Subheader";
export type { YoSubheaderProps, YoSubheaderTone, YoSubheaderPad } from "./list/Subheader";

export { YoListItem } from "./list/ListItem";
export type {
  YoListItemProps,
  YoListItemRole,
  YoListItemSize,
  YoListItemRing,
} from "./list/ListItem";

export { YoDescriptionList } from "./display/DescriptionList";
export type { YoDescriptionListProps, YoDescriptionItem } from "./display/DescriptionList";

export { YoAddressField } from "./form/AddressField";
export type { YoAddressFieldProps, YoAddressFieldApi } from "./form/AddressField";
export {
  addressClickKind,
  addressDismissOutside,
  addressOpenCaret,
  addressScrollPin,
  addressCrumbPath,
  isAddressVacantClick,
} from "./form/address-field-model";
export type {
  AddressClickKind,
  AddressCaret,
  AddressScrollPin,
} from "./form/address-field-model";

export {
  YoSearch,
  createSearchEngine,
  expandSearchGroups,
  mergeSearchRanges,
  normalizeSearchQuery,
  searchDocuments,
  searchFieldHit,
  searchHighlightRanges,
  tokenizeSearchQuery,
} from "./search";
export type {
  YoSearchCancel,
  YoSearchControl,
  YoSearchProps,
  YoSearchSlot,
  YoSearchStatus,
  SearchCombine,
  SearchDocument,
  SearchEmpty,
  SearchEngine,
  SearchField,
  SearchHit,
  SearchHitKind,
  SearchMatch,
  SearchOptions,
  SearchRange,
} from "./search";

export { YoProgressBar } from "./display/ProgressBar";
export type { YoProgressBarProps } from "./display/ProgressBar";

// —— 容器 / 列表 / 滚动 / 栅格 / 导航 ——
export { YoToolbar } from "./container/Toolbar";
export type { YoToolbarProps, YoToolbarPad } from "./container/Toolbar";

export { YoTabs } from "./navigation/Tabs";
export type { YoTabsProps, YoTabItem, YoTabDot, YoTabDotTone } from "./navigation/Tabs";

export { YoTree } from "./list/Tree";
export type { YoTreeProps, TreeNode } from "./list/Tree";

export { YoScroller } from "./scroll/Scroller";
export type { YoScrollerProps, YoScrollerHandle, ScrollerAxis, ScrollerBarState } from "./scroll/Scroller";

export { YoVirtualList } from "./scroll/VirtualList";
export type { YoVirtualListProps, YoVirtualListTone } from "./scroll/VirtualList";

export { YoReorderList } from "./scroll/ReorderList";
export type { YoReorderListProps } from "./scroll/ReorderList";

export {
  insertIndexFromPointerY,
  insertIndexFromRowBoxes,
  moveIndexFromInsert,
  moveItemTo,
  shiftForReorder,
} from "./scroll/reorder-model";

export { YoColResizer } from "./grid/ColResizer";
export type { YoColResizerProps } from "./grid/ColResizer";

export { YoColHeader } from "./grid/ColHeader";
export type { YoColHeaderProps, YoColHeaderAlign, YoColHeaderSort, YoColHeaderTone } from "./grid/ColHeader";

export { YoColFrame } from "./grid/ColFrame";
export type { YoColFrameProps, YoColCellPad, YoColFrameTone } from "./grid/ColFrame";

export { YoColRow } from "./grid/ColRow";
export type { YoColRowProps } from "./grid/ColRow";

export { YoColTrack } from "./grid/ColTrack";
export type { YoColTrackProps } from "./grid/ColTrack";

export { YoColCell } from "./grid/ColCell";
export type { YoColCellProps } from "./grid/ColCell";

export {
  charsTrack,
  colTrackTemplate,
  defaultColWidths,
  setColWidth,
} from "./grid/col-model";
export type { YoColSpec, YoColWidths } from "./grid/col-model";

export { YoPanel } from "./container/Panel";
export type {
  YoPanelProps,
  YoPanelAlign,
  YoPanelEdge,
  YoPanelGap,
  YoPanelOverflow,
  YoPanelPadding,
  YoPanelVariant,
} from "./container/Panel";

export { YoPage } from "./container/Page";
export type { YoPageProps, YoPageRole } from "./container/Page";

export { YoFormRow } from "./container/FormRow";
export type { YoFormRowProps, YoFormRowLayout, YoFormRowPad } from "./container/FormRow";

export { YoCorner, CornerPillRadius } from "./corner";
export type {
  YoCornerProps,
  YoCornerAlign,
  YoCornerDirection,
  YoCornerFlex,
  YoCornerGap,
  YoCornerJustify,
  YoCornerOverflow,
  YoCornerPad,
  CornerRadii,
  CornerRole,
} from "./corner";

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

// —— 空态与加载 / 弹窗 ——
export { YoEmptyState } from "./feedback/EmptyState";
export type { YoEmptyStateProps } from "./feedback/EmptyState";

export { YoLoading } from "./feedback/Loading";
export type { YoLoadingProps } from "./feedback/Loading";

export { YoDialog } from "./overlay/Dialog";
export type {
  YoDialogProps,
  YoDialogBodyLayout,
  YoDialogBodyOverflow,
  YoDialogBodyPad,
  YoDialogInitial,
} from "./overlay/Dialog";

export { YoTooltip, YoTooltipHost } from "./overlay/Tooltip";
export type { YoTooltipProps, YoTooltipHostProps } from "./overlay/Tooltip";

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
export type { ToastTone, Toaster, YoToastProps, YoToasterProps } from "./overlay/Toast";

export {
  YoPresence,
  YoListPresence,
  YoCollapse,
  YoReveal,
  YoTravel,
  YoGrow,
  YoSwap,
  YoIndicator,
  YoRail,
  YoRailSlot,
  useRail,
  railSlotOpen,
  railStreamAttr,
  railStreamOpen,
  railPhaseAfterWidthSettle,
  railPhaseOnIntentChange,
  railTooltipEnabled,
  railTraveling,
  railWidthIntent,
  railWidthMatchesIntent,
  prefersReducedMotion,
  shouldSkipMotion,
  DISMISS_HOLD_DURATION,
} from "./motion";
export type {
  YoPresenceProps,
  YoListPresenceProps,
  YoCollapseProps,
  CollapseRecipe,
  YoRevealProps,
  YoTravelProps,
  YoGrowProps,
  TravelAxis,
  YoSwapProps,
  YoIndicatorProps,
  IndicatorVariant,
  YoRailProps,
  YoRailContextValue,
  YoRailSlotProps,
  RailSlotAxis,
  RailIntent,
  RailPhase,
  PresenceRecipe,
} from "./motion";

// —— 窗口铬 ——
export { YoChrome } from "./chrome/chrome";
export type { YoChromeAction, YoChromeProps } from "./chrome/chrome";
export { YoTitleBar } from "./chrome/TitleBar";
export type { YoTitleBarProps } from "./chrome/TitleBar";

export { YoStatusBar } from "./chrome/StatusBar";
export type { YoStatusBarProps } from "./chrome/StatusBar";
