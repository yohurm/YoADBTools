/**
 * 模块导航（UI设计系统-v6.md §3）：展开为图标+标题，图标轨只留图标。
 * 行走 YoListItem；分组走 YoSubheader；系统区走 YoDivider。
 * 键盘：roving tabindex（激活项 0）+ Enter/Space 导航 + aria-current。
 * 设置是壳内建页（kind=system）：钉在侧栏底部，与模块用横线隔开。
 */

import { Component, For, Show } from "solid-js";

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
  railSlotOpen,
  railTooltipEnabled,
  useRail,
  type RailIntent,
} from "@yohu/ui";

import { systemModules, workspaceModules, type ModuleDescriptor } from "../registry";

function navItemLabel(mod: ModuleDescriptor): string {
  return mod.isPlanned ? `${mod.title}（开发中）` : mod.title;
}

const NavItem: Component<{
  mod: ModuleDescriptor;
  activeId: string;
  iconTip: boolean;
  onNavigate: (id: string) => void;
}> = (props) => {
  const active = () => props.mod.id === props.activeId;
  const onItemKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onNavigate(props.mod.id);
    }
  };
  const name = () => props.mod.title;
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
        label={props.iconTip ? tip() : name()}
        title={name()}
        leading={
          props.iconTip ? (
            <YoTooltip content={tip()}>{icon()}</YoTooltip>
          ) : (
            icon()
          )
        }
        trailing={props.mod.isPlanned ? <YoBadge text="开发中" tone="neutral" /> : undefined}
        onClick={() => props.onNavigate(props.mod.id)}
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
  return (
    <nav class="yohu-nav" aria-label="侧栏导航">
      <div class="yohu-nav__modules">
        <YoRailSlot open={railSlotOpen(phase())}>
          <YoSubheader title="模块" />
        </YoRailSlot>
        <YoScroller>
          <ul class="yohu-nav__list">
            <For each={[...workspaceModules()]}>
              {(mod) => (
                <NavItem
                  mod={mod}
                  activeId={props.activeId}
                  iconTip={iconTip()}
                  onNavigate={props.onNavigate}
                />
              )}
            </For>
          </ul>
        </YoScroller>
      </div>
      <Show when={systemModules().length > 0}>
        <div class="yohu-nav__footer">
          <YoDivider />
          <ul class="yohu-nav__list" aria-label="系统">
            <For each={[...systemModules()]}>
              {(mod) => (
                <NavItem
                  mod={mod}
                  activeId={props.activeId}
                  iconTip={iconTip()}
                  onNavigate={props.onNavigate}
                />
              )}
            </For>
          </ul>
        </div>
      </Show>
    </nav>
  );
};
