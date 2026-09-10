/**
 * YoTree —— 泛型树（L4 视图）。
 * HarmonyOS 对照：Tree；命令库等层级导航。
 * 受控 API：data / onSelect / expandedKeys / defaultExpandedKeys。
 *
 * 键盘：
 * - ↑/↓ 在可见节点间移动焦点；→ 展开（有子节点时，否则移到下一节点）；← 收起（已展开时，否则移到父节点）
 * - Enter 选中；空格选中（不滚动）
 *
 * ARIA：`role=tree/treeitem` + `aria-expanded` + roving tabindex（仅焦点节点 tabindex=0）。
 * 受控展开（expandedKeys）或默认展开（defaultExpandedKeys）。
 * 子树用 YoCollapse，关闭后仍挂载（aria-hidden），高度走 MotionSpec。
 * 选中只挂 yohu-interactive--selected；单选滑块走 YoIndicator fill，不自绘第二套选中底。
 */
import { For, Show, createMemo, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { Icon, type IconName } from "../icons";
import { Layout } from "../tokens/layout";
import { YoCollapse } from "../motion/collapse";
import { YoIndicator } from "../motion/indicator";
import { YoBadge } from "./Badge";
import { YoTooltip } from "./Tooltip";
import { flattenVisible, treeHasChildren, treeKeySelector } from "./tree-model";
import {
  isTreeControlled,
  isTreeExpanded,
  resolveTreeKeyAction,
  toggleExpandedSet,
  treeRowAttrs,
} from "./tree-policy";
import "./Tree.css";

export interface TreeNode<T = unknown> {
  /** 节点唯一 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 可选图标 */
  icon?: IconName;
  /** 子节点 */
  children?: TreeNode<T>[];
  /** 业务数据 */
  data?: T;
  /** 尾部胶囊徽章（如命令数） */
  badge?: string;
  /** hover 完整提示（如命令模板） */
  title?: string;
}

export interface YoTreeProps<T = unknown> {
  /** 树数据 */
  data: TreeNode<T>[];
  /** 受控展开 key（提供时为受控模式） */
  expandedKeys?: string[] | Set<string>;
  /** 默认展开 key（非受控模式） */
  defaultExpandedKeys?: string[];
  /** 选中回调 */
  onSelect?: (key: string, node: TreeNode<T>) => void;
  /** 行高（px）；缺省走 --yohu-row-height-nav，禁止套数据行 --yohu-row-height */
  rowHeight?: number;
}

/**
 * 渲染一棵可展开/选中的树。
 */
export function YoTree<T = unknown>(props: YoTreeProps<T>): JSX.Element {
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set(props.defaultExpandedKeys ?? []));
  const [selected, setSelected] = createSignal<string | null>(null);
  const [focusedKey, setFocusedKey] = createSignal<string | null>(null);
  let root: HTMLDivElement | undefined;

  const isExpanded = (key: string): boolean => isTreeExpanded(key, props.expandedKeys, expanded());

  const toggle = (key: string): void => {
    if (isTreeControlled(props.expandedKeys)) return;
    setExpanded((prev) => toggleExpandedSet(prev, key));
  };

  const select = (node: TreeNode<T>): void => {
    setSelected(node.key);
    props.onSelect?.(node.key, node);
  };

  const rows = createMemo(() => flattenVisible(props.data, isExpanded));

  const focusKey = (key: string): void => {
    setFocusedKey(key);
    const el = root?.querySelector<HTMLElement>(treeKeySelector(key));
    el?.focus();
  };

  const onTreeKeyDown = (event: KeyboardEvent): void => {
    const action = resolveTreeKeyAction(event.key, rows(), focusedKey(), selected(), isExpanded);
    if (!action) return;
    event.preventDefault();
    if (action.type === "focus") {
      focusKey(action.key);
      return;
    }
    const current = rows().find((row) => row.node.key === action.key)?.node;
    if (!current) return;
    if (action.type === "toggle") {
      toggle(current.key);
      return;
    }
    select(current);
  };

  const renderNodes = (nodes: TreeNode<T>[], depth: number): JSX.Element => (
    <For each={nodes}>
      {(node) => {
        const hasChildren = treeHasChildren(node);
        const expandedNow = (): boolean => hasChildren && isExpanded(node.key);
        const attrs = () =>
          treeRowAttrs({
            key: node.key,
            selectedKey: selected(),
            focusedKey: focusedKey(),
            hasChildren,
            expanded: expandedNow(),
          });
        return (
          <>
            <div
              data-tree-key={node.key}
              class="yohu-tree__row yohu-interactive yohu-focus-ring--inset"
              classList={{
                "yohu-interactive--selected": attrs().selected,
              }}
              role="treeitem"
              aria-expanded={attrs()["aria-expanded"]}
              aria-selected={attrs()["aria-selected"]}
              tabindex={attrs().tabindex}
              style={{
                "padding-left": `calc(${depth} * var(--yohu-space-lg))`,
              }}
              onClick={() => {
                select(node);
                setFocusedKey(node.key);
              }}
            >
              {hasChildren ? (
                <button
                  type="button"
                  class="yohu-tree__chevron"
                  aria-label={expandedNow() ? "收起" : "展开"}
                  tabindex={-1}
                  onClick={(event) => {
                    event.stopPropagation();
                    select(node);
                    setFocusedKey(node.key);
                    toggle(node.key);
                  }}
                >
                  <span classList={{ "yohu-recipe-tree-chevron": true, "yohu-recipe-tree-chevron--open": expandedNow() }}>
                    <Icon name="chevron-down" size={Layout.IconInline} />
                  </span>
                </button>
              ) : (
                <span class="yohu-tree__chevron" data-leaf="" />
              )}
              {node.icon ? <Icon name={node.icon} size={Layout.IconSm} /> : null}
              <YoTooltip content={node.title ?? node.label} disabled={!node.title}>
                <span class="yohu-tree__label">{node.label}</span>
              </YoTooltip>
              {node.badge ? <YoBadge text={node.badge} /> : null}
            </div>
            <Show when={hasChildren}>
              <YoCollapse open={expandedNow()}>{renderNodes(node.children!, depth + 1)}</YoCollapse>
            </Show>
          </>
        );
      }}
    </For>
  );

  return (
    <div
      ref={root}
      class="yohu-tree"
      role="tree"
      aria-label="树"
      tabindex={0}
      onKeyDown={onTreeKeyDown}
      style={
        props.rowHeight !== undefined ? { "--yohu-tree-row-height": `${props.rowHeight}px` } : undefined
      }
    >
      <YoIndicator follow={selected()} variant="fill" />
      {renderNodes(props.data, 0)}
    </div>
  );
}
