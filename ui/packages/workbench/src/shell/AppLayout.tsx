/**
 * 工作台主布局：窗口铬（应用标题 + 主题钮 + 侧栏钮 + 三键）+ 左侧抽屉（设备栏 + 模块导航）
 * / 右侧内容区（模块自带标题区与功能栏）/ 底部状态栏。
 * 单一 canvas 铺满窗口；标题栏/侧栏/状态栏不刷互打架的实底。
 */

import { type Component, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import { mirrorPresentSetActive } from "@yohu/api";

import { APP_ICON_SRC } from "../app-identity";
import { selectedDeviceLabel } from "./device-label";
import {
  YoContextMenuHost,
  YoTooltipHost,
  YoIconButton,
  YoPresence,
  YoThemeToggle,
  YoTitleBar,
  closeContextMenu,
  shouldSkipMotion,
} from "@yohu/ui";

import { modules, type ModuleDescriptor } from "../registry";
import { deviceStore, settingsStore } from "../stores";
import { DeviceRail } from "./DeviceRail";
import { NavList } from "./NavList";
import { StatusBar } from "./StatusBar";
import { mirrorPresentShouldBeActive } from "./mirror-stage";

/** 模块区：PC 层级转场淡入淡出（动画系统-v6.md 配方 module-fade）。 */
const ModuleView: Component<{ mod: ModuleDescriptor }> = (props) => {
  // 独立组件：keyed Show 回调在 untrack 内，必须在此追踪 deviceStore / settingsStore。
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

function syncMirrorPresent(moduleId: string | undefined): void {
  void mirrorPresentSetActive(mirrorPresentShouldBeActive(moduleId));
}

const ModuleStage: Component<{
  current: ModuleDescriptor | undefined;
}> = (props) => {
  const [shown, setShown] = createSignal<ModuleDescriptor | undefined>(props.current);
  const [gate, setGate] = createSignal(true);

  onMount(() => {
    syncMirrorPresent(shown()?.id);
  });

  createEffect(() => {
    const next = props.current;
    const cur = shown();
    if (next?.id === cur?.id) return;
    if (cur && !mirrorPresentShouldBeActive(next?.id)) {
      syncMirrorPresent(next?.id);
    }
    if (!cur || shouldSkipMotion()) {
      setShown(next);
      setGate(true);
      if (mirrorPresentShouldBeActive(next?.id)) syncMirrorPresent(next?.id);
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
        syncMirrorPresent(props.current?.id);
      }}
    >
      <Show when={shown()} keyed>
        {(mod) => <ModuleView mod={mod} />}
      </Show>
    </YoPresence>
  );
};

/** 工作台壳（activeModuleId 由 App 持有；窗口三键由 App 接线 Tauri）。 */
export const AppLayout: Component<{
  activeModuleId: () => string;
  onNavigate: (id: string) => void;
  maximized?: boolean;
  onMinimize?: () => void;
  onToggleMaximize?: () => void;
  onClose?: () => void;
  nativeCaptions?: boolean;
}> = (props) => {
  const current = () => modules().find((m) => m.id === props.activeModuleId());
  const [railOpen, setRailOpen] = createSignal(true);

  createEffect(() => {
    props.activeModuleId();
    closeContextMenu();
  });

  return (
    <div class="yohu-window">
      <YoTitleBar
        title={settingsStore.identity.display_name}
        logoSrc={APP_ICON_SRC}
        maximized={props.maximized}
        onMinimize={props.onMinimize}
        onToggleMaximize={props.onToggleMaximize}
        onClose={props.onClose}
        nativeCaptions={props.nativeCaptions}
        actions={
          <>
            <YoThemeToggle
              onThemeChange={(theme) => {
                void settingsStore.set("theme", theme);
              }}
            />
            <YoIconButton
              icon="sidebar"
              title={railOpen() ? "收起侧栏" : "展开侧栏"}
              aria-expanded={railOpen()}
              onClick={() => setRailOpen((open) => !open)}
            />
          </>
        }
      />
      <div
        class="yohu-layout yohu-recipe-rail"
        classList={{ "yohu-layout--rail-collapsed": !railOpen() }}
      >
        <aside class="yohu-layout__rail" inert={!railOpen() ? true : undefined}>
          <div class="yohu-layout__rail-inner">
            <DeviceRail moduleId={props.activeModuleId()} selectionMode={current()?.selectionMode} />
            <NavList activeId={props.activeModuleId()} onNavigate={props.onNavigate} />
          </div>
        </aside>
        <main class="yohu-layout__content">
          <ModuleStage current={current()} />
        </main>
        <StatusBar />
      </div>
      <YoContextMenuHost />
      <YoTooltipHost />
    </div>
  );
};

// 布局样式（token 引用见 @yohu/ui theme.css；此处仅结构性布局）
import "./shell.css";
