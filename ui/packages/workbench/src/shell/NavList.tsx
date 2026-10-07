/**
 * 模块导航（UI设计系统-v6.md §3）：展开为图标+标题，图标轨只留图标。
 * 行走 YoListItem；分组走 YoSubheader；系统区走 YoDivider。
 * 键盘：roving tabindex（激活项 0）+ Enter/Space 导航 + aria-current。
 * 设置是壳内建页（kind=system）：钉在侧栏底部，与模块用横线隔开。
 */

import { Component, For, Show, type JSX } from "solid-js";

import {
  Icon,
  Layout,
  YoBadge,
  YoDivider,
  YoListItem,
  YoRailSlot,
  YoScroller,
  YoSubheader,
  YoTooltip,
  listActivateKey,
  railSlotOpen,
  railTooltipEnabled,
  useRail,
  type RailIntent,
} from "@yohu/ui";

import { moduleIsActive, moduleIsPlanned, systemModules, workspaceModules, type ModuleDescriptor } from "../registry";
import { settingsStore } from "../stores";

function moduleTitle(mod: ModuleDescriptor): string {
  return mod.title;
}

function navItemLabel(mod: ModuleDescriptor): string {
  return moduleIsPlanned(mod) ? `${moduleTitle(mod)}（开发中）` : moduleTitle(mod);
}

const NavItem: Component<{
  mod: ModuleDescriptor;
  activeId: string;
  iconTip: boolean;
  onNavigate: (id: string) => void;
}> = (props) => {
  function itemId(): string {
    return props.mod.id;
  }

  function showIconTip(): boolean {
    return props.iconTip;
  }

  function openItem(): void {
    props.onNavigate(itemId());
  }

  const active = () => moduleIsActive(itemId(), props.activeId);
  const onItemKeyDown = (event: KeyboardEvent): void => {
    if (listActivateKey(event.key)) {
      event.preventDefault();
      openItem();
    }
  };
  const name = () => moduleTitle(props.mod);
  const tip = () => navItemLabel(props.mod);
  const icon = () => <Icon name={props.mod.icon} size={Layout.IconSm} />;

  return (
    <li>
      <YoListItem
        role="button"
        size="nav"
        ring="inset"
        current={active()}
        selected={active()}
        tabIndex={active() ? 0 : -1}
        label={showIconTip() ? tip() : name()}
        title={name()}
        leading={
          showIconTip() ? (
            <YoTooltip content={tip()}>{icon()}</YoTooltip>
          ) : (
            icon()
          )
        }
        trailing={moduleIsPlanned(props.mod) ? <YoBadge text="开发中" tone={settingsStore.neutralTone()} /> : undefined}
        onClick={openItem}
        onKeyDown={onItemKeyDown}
      />
    </li>
  );
};

export const NavList: Component<{
  activeId: string;
  onNavigate: (id: string) => void;
  intent?: RailIntent;
}> = (props) => {
  const rail = useRail();
  const phase = () => rail?.phase() ?? props.intent ?? "expanded";
  const iconTip = () => railTooltipEnabled(phase());

  function navListClass(): string {
    return "yohu-nav__list";
  }

  function navEntry(mod: ModuleDescriptor): JSX.Element {
    return (
      <NavItem
        mod={mod}
        activeId={props.activeId}
        iconTip={iconTip()}
        onNavigate={props.onNavigate}
      />
    );
  }

  return (
    <nav class="yohu-nav" aria-label="侧栏导航">
      <div class="yohu-nav__modules">
        <YoRailSlot open={railSlotOpen(phase())}>
          <YoSubheader title="模块" />
        </YoRailSlot>
        <YoScroller>
          <ul class={navListClass()}>
            <For each={[...workspaceModules()]}>{navEntry}</For>
          </ul>
        </YoScroller>
      </div>
      <Show when={systemModules().length > 0}>
        <div class="yohu-nav__footer">
          <YoDivider />
          <ul class={navListClass()} aria-label="系统">
            <For each={[...systemModules()]}>{navEntry}</For>
          </ul>
        </div>
      </Show>
    </nav>
  );
};
