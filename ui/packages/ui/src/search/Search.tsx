/**
 * YoSearch —— 搜索框（L4 视图）。
 * HarmonyOS Search：左 searchIcon、右 INPUT 清除、Enter 提交、可折叠为图标。
 * 不是 YoTextField。检索引擎在 engine/；本文件只绑铬与槽位。
 */
import { Show, createEffect, createMemo, createUniqueId, on } from "solid-js";
import type { JSX } from "solid-js";
import { YoCorner } from "../corner";
import { ClearMark } from "../form/clear-mark";
import { Icon } from "../icons";
import { YoCollapse } from "../motion/engines/collapse";
import { YoTooltip } from "../overlay/Tooltip";
import { Layout } from "../tokens/layout";
import {
  resolveSearchOpen,
  resolveSearchSlot,
  searchEntryPressed,
  searchHostAttrs,
  searchShowsBar,
  searchShowsEntry,
  type YoSearchCancel,
  type YoSearchSlot,
  type YoSearchStatus,
} from "./search-policy";
import "./Search.css";

export type { YoSearchCancel, YoSearchSlot, YoSearchStatus };

export type YoSearchControl = HTMLInputElement;

export interface YoSearchProps {
  /** 受控查询。 */
  value?: string;
  /** 输入回调（携带新值与原事件）。 */
  onInput?: (value: string, event: InputEvent) => void;
  /** Enter / 搜索提交。 */
  onSubmit?: (value: string) => void;
  /** 占位。 */
  placeholder?: string;
  /** 栏的无障碍名。 */
  ariaLabel?: string;
  /** 入口可见提示（对照 YoIconButton.title）；同时作入口 aria-label。 */
  title?: string;
  /** 禁用。 */
  disabled?: boolean;
  /** 铺满父级。栏默认铺；false 才 hug。 */
  block?: boolean;
  /** 校验态。默认 none。 */
  status?: YoSearchStatus;
  /** 过滤生效描边。未写时有查询即亮。 */
  active?: boolean;
  /** Harmony CancelButtonStyle。默认 input。 */
  cancel?: YoSearchCancel;
  /** 折叠为图标。默认关。 */
  collapsible?: boolean;
  /** 折叠受控开闭。 */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * entry = 标题行图标；bar = 搜索栏；both = 图标+栏。
   * 标题行与栏分槽时两实例共用 id。
   */
  slot?: YoSearchSlot;
  /** 入口 / 栏关联 id。 */
  id?: string;
  /** 转发内部 input。 */
  inputRef?: (el: YoSearchControl) => void;
}

export function YoSearch(props: YoSearchProps): JSX.Element {
  const fallbackId = createUniqueId();
  const searchId = createMemo(() => props.id ?? fallbackId);
  const slot = createMemo(() => resolveSearchSlot(props.slot));
  const host = createMemo(() =>
    searchHostAttrs({
      slot: props.slot,
      collapsible: props.collapsible,
      open: props.open,
      value: props.value,
      status: props.status,
      cancel: props.cancel,
      disabled: props.disabled,
      block: props.block,
      active: props.active,
    }),
  );
  let inputEl: HTMLInputElement | undefined;

  const bindInput = (el: HTMLInputElement): void => {
    inputEl = el;
    props.inputRef?.(el);
  };

  const emit = (value: string, event: InputEvent): void => {
    props.onInput?.(value, event);
  };

  const handleInput = (event: InputEvent): void => {
    emit((event.currentTarget as HTMLInputElement).value, event);
  };

  const handleChange = (event: Event): void => {
    emit((event.currentTarget as HTMLInputElement).value, event as InputEvent);
  };

  const handleClear = (): void => {
    if (host().disabled) return;
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
    emit("", new InputEvent("input"));
  };

  const handleSubmit = (event: Event): void => {
    event.preventDefault();
    props.onSubmit?.(props.value ?? inputEl?.value ?? "");
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    const value = props.value ?? inputEl?.value ?? "";
    if (value.length > 0) {
      event.preventDefault();
      handleClear();
      return;
    }
    if (props.collapsible && resolveSearchOpen({ collapsible: true, open: props.open })) {
      event.preventDefault();
      props.onOpenChange?.(false);
    }
  };

  const toggleOpen = (): void => {
    if (host().disabled) return;
    props.onOpenChange?.(!resolveSearchOpen({ collapsible: props.collapsible, open: props.open }));
  };

  createEffect(
    on(
      () => host()["data-open"] === "true" && searchShowsBar(slot()),
      (now, was) => {
        if (now && was === false) {
          requestAnimationFrame(() => inputEl?.focus());
        }
      },
    ),
  );

  const entryLabel = (): string => props.title ?? props.ariaLabel ?? "搜索";

  const EntryButton = (): JSX.Element => (
    <button
      type="button"
      class="yohu-search__entry yohu-focus-ring"
      data-pressed={
        searchEntryPressed({ open: host()["data-open"] === "true", value: props.value })
          ? true
          : undefined
      }
      aria-label={entryLabel()}
      aria-expanded={props.collapsible ? host()["data-open"] === "true" : undefined}
      aria-controls={props.collapsible ? searchId() : undefined}
      disabled={host().disabled}
      onClick={toggleOpen}
    >
      <YoCorner role="control" class="yohu-search__entry-chrome" direction="row" align="center" justify="center">
        <Icon name="search" />
      </YoCorner>
    </button>
  );

  const entry = (
    <Show when={searchShowsEntry(slot())}>
      <Show when={props.title} fallback={<EntryButton />}>
        <YoTooltip content={props.title ?? ""} disabled={host().disabled}>
          <EntryButton />
        </YoTooltip>
      </Show>
    </Show>
  );

  const Bar = (): JSX.Element => (
    <form id={searchId()} class="yohu-search__bar" role="search" onSubmit={handleSubmit}>
      <div
        class="yohu-search__control yohu-focus-host"
        onMouseDown={(event) => {
          if (!inputEl || event.button !== 0) return;
          const target = event.target;
          if (!(target instanceof Element)) return;
          if (target.closest("button")) return;
          if (target === inputEl) return;
          event.preventDefault();
          inputEl.focus();
        }}
      >
        <YoCorner
          role="control"
          class="yohu-search__chrome"
          direction="row"
          align="center"
          overflow="hidden"
          pad="inline-sm"
          gap="xs"
        >
          <span class="yohu-search__affix" data-edge="start">
            <Icon name="search" size={Layout.IconInline} />
          </span>
          <input
            ref={bindInput}
            id={`${searchId()}-q`}
            class="yohu-search__input"
            type="search"
            size={1}
            value={props.value ?? ""}
            placeholder={props.placeholder}
            aria-label={props.ariaLabel ?? props.title ?? "搜索"}
            aria-invalid={host()["aria-invalid"]}
            disabled={host().disabled}
            onInput={handleInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <Show when={host()["data-clearable"]}>
            <ClearMark onClear={handleClear} />
          </Show>
        </YoCorner>
      </div>
    </form>
  );

  return (
    <div
      class="yohu-search"
      data-slot={host()["data-slot"]}
      data-open={host()["data-open"]}
      data-collapsible={host()["data-collapsible"]}
      data-status={host()["data-status"]}
      data-paint={host()["data-paint"]}
      data-width={host()["data-width"]}
      data-clearable={host()["data-clearable"]}
      data-disabled={host()["data-disabled"]}
      data-active={host()["data-active"]}
    >
      {entry}
      <Show when={searchShowsBar(slot())}>
        <Show when={props.collapsible} fallback={<Bar />}>
          <YoCollapse open={host()["data-open"] === "true"}>
            <Bar />
          </YoCollapse>
        </Show>
      </Show>
    </div>
  );
}
