/**
 * YoUI 族谱（对照 HarmonyOS ArkTS 组件分类）。
 * L5 仍从 @yohu/ui 单入口导出；源码按族分目录，禁止再堆进 components/。
 */

export const FAMILY_LABELS = {
  basic: "按钮与选择",
  blank: "空白与分隔",
  form: "文本与输入",
  display: "信息展示",
  container: "行列与堆叠 / 卡片",
  grid: "栅格与分栏",
  scroll: "滚动与滑动",
  list: "列表",
  navigation: "导航与切换",
  overlay: "弹窗",
  feedback: "空态与加载",
  chrome: "窗口框架",
  "context-menu": "菜单",
};

/** 产品族（容器不得跨族 import 产品 Yo*）。 */
export const PRODUCT_FAMILIES = [
  "basic",
  "blank",
  "form",
  "display",
  "container",
  "grid",
  "scroll",
  "list",
  "navigation",
  "overlay",
  "feedback",
  "chrome",
];

/** 文件词干 → 族。含 L2/L3 与测试。 */
export const FAMILY_STEMS = {
  basic: [
    "Button",
    "button-model",
    "button-policy",
    "IconButton",
    "icon-button-model",
    "icon-button-policy",
    "SegmentedButton",
    "segmented-model",
    "segmented-policy",
    "ThemeToggle",
    "theme-toggle-model",
    "theme-toggle-policy",
    "Checkbox",
    "checkbox-model",
    "checkbox-policy",
    "Switch",
    "switch-model",
    "switch-policy",
  ],
  blank: ["Divider", "divider-model"],
  form: [
    "TextField",
    "textfield-model",
    "textfield-policy",
    "textfield-grow",
    "Select",
    "select-model",
    "select-policy",
    "select-place",
    "AddressField",
    "address-field-model",
    "clear-mark",
  ],
  display: [
    "Badge",
    "badge-model",
    "badge-policy",
    "Chip",
    "chip-model",
    "chip-policy",
    "dismiss-mark",
    "StatusDot",
    "status-dot-model",
    "status-dot-policy",
    "ProgressBar",
    "progress-model",
    "progress-policy",
    "DescriptionList",
    "description-list-model",
  ],
  container: [
    "Page",
    "page",
    "page-model",
    "page-policy",
    "Panel",
    "panel-model",
    "panel-policy",
    "Toolbar",
    "toolbar-model",
    "toolbar-policy",
    "FormRow",
    "formrow-model",
    "formrow-policy",
  ],
  grid: [
    "ColCell",
    "ColFrame",
    "ColHeader",
    "ColResizer",
    "ColRow",
    "ColTrack",
    "col-header-model",
    "col-header-policy",
    "col-model",
    "col-resize",
  ],
  scroll: [
    "Scroller",
    "scroller-model",
    "scroller-policy",
    "VirtualList",
    "virtuallist-model",
    "virtuallist-policy",
    "ReorderList",
    "ReorderBar",
    "ReorderOverlay",
    "reorder-model",
    "reorder-policy",
    "reorder-binder",
  ],
  list: [
    "ListItem",
    "list-item-model",
    "list-item-policy",
    "list-item-mark-model",
    "Mark",
    "Subheader",
    "subheader-model",
    "Tree",
    "tree-model",
    "tree-policy",
  ],
  navigation: ["Tabs", "tabs-model", "tabs-policy"],
  overlay: [
    "Dialog",
    "dialog-model",
    "dialog-policy",
    "dialog-stack",
    "dialog-focus",
    "Tooltip",
    "tooltip-model",
    "tooltip-policy",
    "tooltip-place",
    "Toast",
    "toast-model",
    "toast-policy",
    "popover-place",
  ],
  feedback: ["EmptyState", "empty-model", "empty-policy", "Loading", "loading-model", "loading-policy"],
  chrome: [
    "chrome",
    "chrome-model",
    "chrome-policy",
    "TitleBar",
    "titlebar-model",
    "titlebar-policy",
    "StatusBar",
    "statusbar-model",
    "statusbar-policy",
  ],
  "context-menu": ["ContextMenu"],
};

/** 对照鸿蒙 bindPopup：控件可挂提示，不是容器嵌产品件。 */
export const ALLOWED_CROSS = {
  "basic/IconButton.tsx": ["overlay/Tooltip"],
  "form/AddressField.tsx": ["overlay/Tooltip"],
  "search/Search.tsx": ["overlay/Tooltip"],
};

export const CONTAINER_VIEWS = new Set([
  "container/Page.tsx",
  "container/Panel.tsx",
  "container/Toolbar.tsx",
  "container/FormRow.tsx",
  "overlay/Dialog.tsx",
  "overlay/Toast.tsx",
  "chrome/chrome.tsx",
  "chrome/TitleBar.tsx",
  "chrome/StatusBar.tsx",
  "scroll/Scroller.tsx",
  "scroll/VirtualList.tsx",
  "scroll/ReorderList.tsx",
  "list/Tree.tsx",
  "navigation/Tabs.tsx",
  "feedback/EmptyState.tsx",
  "feedback/Loading.tsx",
]);

export function fileStem(name) {
  return name.replace(/\.test\.(tsx|ts)$/i, "").replace(/\.(tsx|ts|css)$/i, "");
}

export function stemToFamilyMap() {
  const map = new Map();
  for (const [family, stems] of Object.entries(FAMILY_STEMS)) {
    for (const stem of stems) map.set(stem, family);
  }
  return map;
}

export function familyOfFile(name) {
  return stemToFamilyMap().get(fileStem(name));
}
