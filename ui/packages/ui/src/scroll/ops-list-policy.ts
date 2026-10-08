/**
 * 操作项功能 → 虚拟列表开关（L3）。
 * 返回要摊到 YoVirtualList 上的字段。未声明的回调不出现。
 * 不渲染、不 import 列表视图。行内容由调用方另组。
 */
import type { Accessor } from "solid-js";
import { resolveOpsFeatures, type YoOpsFeature } from "./ops-feature-model";

export interface OpsListHandlers<T> {
  features?: readonly YoOpsFeature[];
  selectedKey?: Accessor<string | number | null>;
  selectedKeys?: Accessor<ReadonlySet<string | number>>;
  onSelectRow?: (item: T, key: string | number, event?: MouseEvent | KeyboardEvent) => void;
  onReorder?: (from: number, to: number) => void;
  onRowContextMenu?: (item: T, key: string | number, event: MouseEvent) => void;
}

export interface OpsListBindings<T> {
  tone?: "list";
  /** 操作项每项 ripple 同一圆角。选择打开才写。 */
  rowRadius?: "chip";
  selectedKey?: Accessor<string | number | null>;
  selectedKeys?: Accessor<ReadonlySet<string | number>>;
  onSelectRow?: OpsListHandlers<T>["onSelectRow"];
  onReorder?: (from: number, to: number) => void;
  onRowContextMenu?: OpsListHandlers<T>["onRowContextMenu"];
}

/** 功能集投影成清单属性。调用方摊到 YoVirtualList，禁止再包一层清单视图。 */
export function opsListBindings<T>(input: OpsListHandlers<T>): OpsListBindings<T> {
  const spec = resolveOpsFeatures(input.features);
  const bindings: OpsListBindings<T> = {};
  if (spec.rule) bindings.tone = "list";
  if (spec.select) bindings.rowRadius = "chip";
  if (spec.multi) {
    if (input.selectedKeys) bindings.selectedKeys = input.selectedKeys;
  } else if (spec.select && input.selectedKey) {
    bindings.selectedKey = input.selectedKey;
  }
  if (spec.select && input.onSelectRow) bindings.onSelectRow = input.onSelectRow;
  if (spec.reorder && input.onReorder) bindings.onReorder = input.onReorder;
  if (spec.menu && input.onRowContextMenu) bindings.onRowContextMenu = input.onRowContextMenu;
  return bindings;
}
