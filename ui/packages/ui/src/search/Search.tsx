/**
 * YoSearch —— 搜索框（L4 视图）。
 * HarmonyOS Search：左 searchIcon、右 INPUT 清除、Enter 提交、可折叠为图标。
 * 不是 YoTextField。检索引擎在 engine/；本文件只绑铬与槽位。
 */
import { Show, createEffect, createMemo, createUniqueId, on } from "solid-js";
import type { JSX } from "solid-js";
import { flagIsOn, presenceAttr, presenceIsOn } from "../dom/flag";
import { dismissKey } from "../keymap/list-index";
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
  searchHasQuery,
  searchHostAttrs,
  searchShowsBar,
  searchShowsEntry,
  type YoSearchCancel,
  type YoSearchSlot,
} from "./search-policy";
import type { FieldStatus } from "../form/field-status";
import "./Search.css";

export type { YoSearchCancel, YoSearchSlot };

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
  status?: FieldStatus;
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

function searchEventValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
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

  function searchDisabled(): boolean {
    return host().disabled;
  }

  function searchOpened(): boolean {
    return flagIsOn(host()["data-open"]);
  }

  function searchBarOn(): boolean {
    return searchShowsBar(slot());
  }

  function searchFallbackName(): string {
    return "搜索";
  }

  const bindInput = (el: HTMLInputElement): void => {
    inputEl = el;
    props.inputRef?.(el);
  };

  const emit = (value: string, event: InputEvent): void => {
    props.onInput?.(value, event);
  };

  const handleInput = (event: InputEvent): void => {
    emit(searchEventValue(event), event);
  };

  const handleChange = (event: Event): void => {
    emit(searchEventValue(event), event as InputEvent);
  };

  const handleClear = (): void => {
    if (searchDisabled()) return;
    if (inputEl) {
      inputEl.value = "";
      inputEl.focus();
    }
    emit("", new InputEvent("input"));
  };

  const fieldValue = (): string => props.value ?? inputEl?.value ?? "";

  const handleSubmit = (event: Event): void => {
    event.preventDefault();
    props.onSubmit?.(fieldValue());
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!dismissKey(event.key)) return;
    const value = fieldValue();
    if (searchHasQuery(value)) {
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
    if (searchDisabled()) return;
    props.onOpenChange?.(!resolveSearchOpen({ collapsible: props.collapsible, open: props.open }));
  };

  createEffect(
    on(
      () => searchOpened() && searchBarOn(),
      (now, was) => {
        if (now && was === false) {
          requestAnimationFrame(() => inputEl?.focus());
        }
      },
    ),
  );

  const entryLabel = (): string => props.title ?? props.ariaLabel ?? searchFallbackName();

  const EntryButton = (): JSX.Element => (
    <button
      type="button"
      class="yohu-search__entry yohu-focus-ring"
      data-pressed={presenceAttr(
        searchEntryPressed({ open: searchOpened(), value: props.value }),
      )}
      aria-label={entryLabel()}
      aria-expanded={props.collapsible ? searchOpened() : undefined}
      aria-controls={props.collapsible ? searchId() : undefined}
      disabled={searchDisabled()}
      onClick={toggleOpen}
    >
      <YoCorner role="control" class="yohu-search__entry-chrome" direction="row" align="center" justify="center">
        <Icon name="search" size={Layout.IconMd} />
      </YoCorner>
    </button>
  );

  const entry = (
    <Show when={searchShowsEntry(slot())}>
      <Show when={props.title} fallback={<EntryButton />}>
        <YoTooltip content={props.title ?? ""} disabled={searchDisabled()}>
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
            aria-label={props.ariaLabel ?? props.title ?? searchFallbackName()}
            aria-invalid={host()["aria-invalid"]}
            disabled={searchDisabled()}
            onInput={handleInput}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <Show when={presenceIsOn(host()["data-clearable"])}>
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
      <Show when={searchBarOn()}>
        <Show when={props.collapsible} fallback={<Bar />}>
          <YoCollapse open={searchOpened()}>
            <Bar />
          </YoCollapse>
        </Show>
      </Show>
    </div>
  );
}
