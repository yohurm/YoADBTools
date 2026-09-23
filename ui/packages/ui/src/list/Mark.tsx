/**
 * 列表项强调条（L4）。几何井在 Mark.css；填充开合走配方 selected。
 */
import type { JSX } from "solid-js";
import { LIST_ITEM_MARK_CLASS, LIST_ITEM_MARK_FILL_CLASS } from "./list-item-mark-model";
import "./Mark.css";

export function ListItemMark(): JSX.Element {
  return (
    <span class={LIST_ITEM_MARK_CLASS} aria-hidden="true">
      <span class={LIST_ITEM_MARK_FILL_CLASS} />
    </span>
  );
}
