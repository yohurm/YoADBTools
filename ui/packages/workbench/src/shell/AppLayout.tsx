/**
 * 工作台主布局：窗口铬 + 左侧常驻导航轨（展开文案 / 收起图标）/ 右侧内容区 / 底部状态栏。
 * 单一 canvas 铺满窗口；标题栏/侧栏/状态栏不刷互打架的实底。
 */

import { type Component, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";

import { APP_ICON_SRC } from "../app-identity";
import { selectedDeviceLabel } from "./device-label";
import {
  YoContextMenuHost,
  YoTooltipHost,
  YoIconButton,
  YoPresence,
  YoRail,
  YoThemeToggle,
  YoTitleBar,
  railIntentIsExpanded,
  railToggleIntent,
  shouldSkipMotion,
  type RailIntent,
} from "@yohu/ui";

import { moduleIsActive, modules, type ModuleDescriptor } from "../registry";
import { deviceStore, navStore, settingsStore, windowStore } from "../stores";
import { mirrorPresentShouldBeActive } from "../stores/mirror-present";
import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";

/** 模块区：PC 层级转场淡入淡出（动画系统-v6.md 配方 module-fade）。 */
const ModuleView: Component<{ mod: ModuleDescriptor }> = (props) => {
  const selected = createMemo(() =>
    deviceStore.selectedDevices(props.mod.id, props.mod.selectionMode),
  );
  const View = props.mod.Component;
  return (
    <View
      focusSerial={deviceStore.focus()}
      selectedSerials={selected().map((d) => d.serial)}
      selectedDevices={selected()}
      selectedLabel={selectedDeviceLabel(selected())}
      devices={deviceStore.catalog()}
      deviceStatuses={deviceStore.state.statuses}
      settings={settingsStore.state}
    />
  );
};

const ModuleStage: Component<{
  current: ModuleDescriptor | undefined;
}> = (props) => {
  function incoming(): ModuleDescriptor | undefined {
    return props.current;
  }

  const [shown, setShown] = createSignal<ModuleDescriptor | undefined>(incoming());
  const [gate, setGate] = createSignal(true);

  function openGate(): void {
    setGate(true);
  }

  onMount(() => {
    void navStore.setMirrorPresent(shown()?.id);
  });

  createEffect(() => {
    const next = incoming();
    const cur = shown();
    if (next?.id === cur?.id) return;
    void navStore.setMirrorPresent(next?.id);
    const mirrorInvolved =
      mirrorPresentShouldBeActive(next?.id) || mirrorPresentShouldBeActive(cur?.id);
    if (!cur || shouldSkipMotion() || mirrorInvolved) {
      setShown(next);
      openGate();
      return;
    }
    setGate(false);
  });

  return (
    <YoPresence
      when={gate()}
      recipe="fade"
      onExitComplete={() => {
        setShown(incoming());
        openGate();
      }}
    >
      <Show when={shown()} keyed>
        {(mod) => <ModuleView mod={mod} />}
      </Show>
    </YoPresence>
  );
};

/** 工作台壳。窗口三键与模块身份走 store。 */
export const AppLayout: Component = () => {
  function activeModule(): string {
    return navStore.activeModuleId();
  }

  function windowPaint() {
    return "window" as const;
  }

  const current = () => modules().find((m) => moduleIsActive(m.id, activeModule()));
  const [railIntent, setRailIntent] = createSignal<RailIntent>("expanded");

  function railExpanded(): boolean {
    return railIntentIsExpanded(railIntent());
  }

  const toggleRail = (): void => {
    setRailIntent((current) => railToggleIntent(current));
  };

  return (
    <div class="yohu-window">
      <YoTitleBar
        title={settingsStore.displayName()}
        logoSrc={APP_ICON_SRC}
        maximized={windowStore.maximized()}
        onMinimize={() => void windowStore.minimize()}
        onToggleMaximize={() => void windowStore.toggleMaximize()}
        onClose={() => void windowStore.close()}
        nativeCaptions={settingsStore.macosHost()}
        actions={
          <>
            <YoThemeToggle
              paint={windowPaint()}
              onThemeChange={(theme) => {
                void settingsStore.set("theme", theme);
              }}
            />
            <YoIconButton
              paint={windowPaint()}
              icon="sidebar"
              title={railExpanded() ? "收起侧栏" : "展开侧栏"}
              aria-expanded={railExpanded()}
              onClick={toggleRail}
            />
          </>
        }
      />
      <div class="yohu-layout">
        <div class="yohu-layout__work">
          <YoRail intent={railIntent()} class="yohu-layout__rail">
            <div class="yohu-layout__rail-inner">
              <DeviceRail
                moduleId={activeModule()}
                selectionMode={current()?.selectionMode}
              />
              <NavList
                activeId={activeModule()}
                onNavigate={navStore.navigate}
              />
            </div>
          </YoRail>
          <main class="yohu-layout__content">
            <ModuleStage current={current()} />
          </main>
        </div>
        <StatusBar />
      </div>
      <YoContextMenuHost />
      <YoTooltipHost />
    </div>
  );
};

import "./shell.css";
