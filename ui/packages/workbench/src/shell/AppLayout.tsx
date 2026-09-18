/**
 * 工作台主布局：窗口铬 + 左侧常驻导航轨（展开文案 / 收起图标）/ 右侧内容区 / 底部状态栏。
 * 单一 canvas 铺满窗口；标题栏/侧栏/状态栏不刷互打架的实底。
 */

import { type Component, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";

import { APP_ICON_SRC } from "../app-identity";
import { selectedDeviceLabel } from "./device-label";
import { ModuleId } from "@yohu/api";
import {
  YoContextMenuHost,
  YoTooltipHost,
  YoIconButton,
  YoPresence,
  YoRail,
  YoThemeToggle,
  YoTitleBar,
  shouldSkipMotion,
  type RailIntent,
} from "@yohu/ui";

import { modules, type ModuleDescriptor } from "../registry";
import { deviceStore, navStore, settingsStore, windowStore } from "../stores";
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
      focusSerial={deviceStore.state.focusSerial}
      selectedSerials={selected().map((d) => d.serial)}
      selectedDevices={selected()}
      selectedLabel={selectedDeviceLabel(selected())}
      devices={deviceStore.state.devices}
      deviceStatuses={deviceStore.state.statuses}
      settings={settingsStore.state}
    />
  );
};

const ModuleStage: Component<{
  current: ModuleDescriptor | undefined;
}> = (props) => {
  const [shown, setShown] = createSignal<ModuleDescriptor | undefined>(props.current);
  const [gate, setGate] = createSignal(true);

  onMount(() => {
    void navStore.setMirrorPresent(shown()?.id);
  });

  createEffect(() => {
    const next = props.current;
    void navStore.setMirrorPresent(next?.id);
    const cur = shown();
    if (next?.id === cur?.id) return;
    const mirrorInvolved = next?.id === ModuleId.Mirror || cur?.id === ModuleId.Mirror;
    if (!cur || shouldSkipMotion() || mirrorInvolved) {
      setShown(next);
      setGate(true);
      return;
    }
    setGate(false);
  });

  return (
    <YoPresence
      when={gate()}
      recipe="fade"
      onExitComplete={() => {
        setShown(props.current);
        setGate(true);
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
  const current = () => modules().find((m) => m.id === navStore.activeModuleId());
  const [railIntent, setRailIntent] = createSignal<RailIntent>("expanded");

  const toggleRail = (): void => {
    setRailIntent((current) => (current === "expanded" ? "icons" : "expanded"));
  };

  return (
    <div class="yohu-window">
      <YoTitleBar
        title={settingsStore.identity.display_name}
        logoSrc={APP_ICON_SRC}
        maximized={windowStore.maximized()}
        onMinimize={() => void windowStore.minimize()}
        onToggleMaximize={() => void windowStore.toggleMaximize()}
        onClose={() => void windowStore.close()}
        nativeCaptions={settingsStore.os() === "macos"}
        actions={
          <>
            <YoThemeToggle
              paint="window"
              onThemeChange={(theme) => {
                void settingsStore.set("theme", theme);
              }}
            />
            <YoIconButton
              paint="window"
              icon="sidebar"
              title={railIntent() === "expanded" ? "收起侧栏" : "展开侧栏"}
              aria-expanded={railIntent() === "expanded"}
              onClick={toggleRail}
            />
          </>
        }
      />
      <div
        class="yohu-layout"
        data-rail={railIntent()}
      >
        <div class="yohu-layout__work">
          <YoRail intent={railIntent()} class="yohu-layout__rail">
            <div class="yohu-layout__rail-inner">
              <DeviceRail
                moduleId={navStore.activeModuleId()}
                selectionMode={current()?.selectionMode}
              />
              <NavList
                activeId={navStore.activeModuleId()}
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
