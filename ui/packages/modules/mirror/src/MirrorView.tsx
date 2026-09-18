/**
 * 投屏主视图：只量 `.yohu-mirror__avail`；会话旗标与 invoke 在 store。
 */

import { For, createEffect, onCleanup, onMount } from "solid-js";
import { AndroidKey, errorText, ModuleTitle, type DeviceSession, type MirrorPointerKind } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoChrome,
  YoFormRow,
  YoIconButton,
  YoPage,
  YoPanel,
  YoScroller,
  YoSelect,
  YoToaster,
  createToaster,
  getTheme,
  onResolvedThemeChange,
  type IconName,
} from "@yohu/ui";

import { clientPointerPx, clientZoneRect } from "./layout";
import {
  FPS_OPTIONS,
  PROTOCOL_OPTIONS,
  RATE_OPTIONS,
  SIZE_OPTIONS,
  fpsLabel,
  rateLabel,
  sizeLabel,
  withCurrentOption,
} from "./quality";
import { mirrorStore } from "./store";
import "./mirror.css";

type DeviceOp = { icon: IconName; title: string; keycode: number };

const NAV_OPS: DeviceOp[] = [
  { icon: "nav-back", title: "返回", keycode: AndroidKey.Back },
  { icon: "nav-home", title: "Home", keycode: AndroidKey.Home },
  { icon: "nav-recent", title: "多任务", keycode: AndroidKey.AppSwitch },
  { icon: "volume-down", title: "音量-", keycode: AndroidKey.VolumeDown },
  { icon: "volume-up", title: "音量+", keycode: AndroidKey.VolumeUp },
  { icon: "nav-power", title: "电源", keycode: AndroidKey.Power },
];

const BRIGHTNESS_OPS: DeviceOp[] = [
  { icon: "brightness-down", title: "亮度-", keycode: AndroidKey.BrightnessDown },
  { icon: "brightness-up", title: "亮度+", keycode: AndroidKey.BrightnessUp },
];

export function MirrorView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  let avail: HTMLDivElement | undefined;
  let zoneObserver: ResizeObserver | undefined;
  let stopTheme: (() => void) | undefined;
  let layoutRaf = 0;

  function pushLayout(): void {
    if (layoutRaf !== 0) return;
    layoutRaf = window.requestAnimationFrame(() => {
      layoutRaf = 0;
      if (!avail) return;
      const zone = avail.getBoundingClientRect();
      const vv = window.visualViewport;
      const dpr = window.devicePixelRatio || 1;
      const rect = clientZoneRect(zone, dpr, { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 });
      mirrorStore.reportAvail({
        ...rect,
        visible: document.visibilityState === "visible",
        dpr,
        dark: getTheme() === "dark",
      });
    });
  }

  onMount(() => {
    mirrorStore.applySettings(props.settings);
    pushLayout();
    if (avail) {
      zoneObserver = new ResizeObserver(() => {
        pushLayout();
      });
      zoneObserver.observe(avail);
    }
    stopTheme = onResolvedThemeChange(() => {
      pushLayout();
    });
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("keydown", onEsc);
    document.addEventListener("visibilitychange", onVis);
  });
  onCleanup(() => {
    if (layoutRaf !== 0) window.cancelAnimationFrame(layoutRaf);
    layoutRaf = 0;
    zoneObserver?.disconnect();
    stopTheme?.();
    window.removeEventListener("scroll", onWin, true);
    window.removeEventListener("keydown", onEsc);
    document.removeEventListener("visibilitychange", onVis);
    mirrorStore.leaveAvail();
  });

  function onWin(): void {
    pushLayout();
  }
  function onVis(): void {
    pushLayout();
  }
  function onEsc(e: KeyboardEvent): void {
    if (e.key !== "Escape" || !mirrorStore.state.fullscreen) return;
    e.preventDefault();
    mirrorStore.setFullscreen(false);
  }

  function reportAvailPointer(event: PointerEvent, kind: MirrorPointerKind): void {
    if (!canControl()) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    if (kind === "down") {
      target.setPointerCapture(event.pointerId);
    } else if ((kind === "up" || kind === "leave") && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    const dpr = window.devicePixelRatio || 1;
    const vv = window.visualViewport;
    const pt = clientPointerPx(event.clientX, event.clientY, dpr, {
      left: vv?.offsetLeft ?? 0,
      top: vv?.offsetTop ?? 0,
    });
    mirrorStore.reportPointer(kind, pt.x, pt.y);
  }

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void mirrorStore.bindSerial(serial);
    mirrorStore.bindConnection(props.selectedDevices[0]?.connection ?? "usb");
  });

  createEffect(() => {
    const serial = props.selectedSerials[0];
    if (!serial) {
      mirrorStore.bindNight(null);
      return;
    }
    mirrorStore.bindNight(props.deviceStatuses[serial]?.night ?? null);
  });

  createEffect(() => {
    mirrorStore.applySettings(props.settings);
  });

  const live = () => mirrorStore.state.phase === "live";
  const canControl = () => live() && mirrorStore.state.hasFrame && !mirrorStore.state.readOnly && mirrorStore.state.control;
  const starting = () => mirrorStore.state.phase === "starting";
  const qualityDisabled = () => starting();

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function runOp(op: DeviceOp): Promise<void> {
    await tapKey(op.keycode);
  }

  async function toggleDeviceNight(): Promise<void> {
    const serial = props.selectedSerials[0];
    const current = mirrorStore.state.night;
    if (!serial || current === null) return;
    try {
      await mirrorStore.setDeviceNight(serial, !current);
    } catch (e) {
      toaster.show(`切换设备深浅色失败: ${errorText(e)}`, "error");
    }
  }

  async function screenshot(): Promise<void> {
    try {
      await mirrorStore.saveScreenshot();
      toaster.show("截图已保存", "success");
    } catch (e) {
      toaster.show(`保存失败: ${errorText(e)}`, "error");
    }
  }

  async function persistQuality(
    key: "mirror_protocol" | "mirror_max_size" | "mirror_video_bit_rate" | "mirror_max_fps",
    value: "usb" | "wifi" | number,
  ): Promise<void> {
    try {
      await mirrorStore.persistQuality(key, value);
    } catch (e) {
      toaster.show(`质量写入失败: ${errorText(e)}`, "error");
    }
  }

  return (
    <YoPage class={`yohu-mirror${mirrorStore.state.fullscreen ? " yohu-mirror--full" : ""}`}>
      <YoChrome
        title={ModuleTitle.Mirror}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
      >
        <YoButton
          size="sm"
          buttonStyle="emphasized"
          disabled={!props.selectedSerials[0] || starting()}
          loading={starting()}
          onClick={() => {
            if (live()) void mirrorStore.stop();
            else void mirrorStore.start();
          }}
        >
          {live() ? "停止" : "开始"}
        </YoButton>
        <YoIconButton
          icon={mirrorStore.state.paused ? "play" : "pause"}
          title={mirrorStore.state.paused ? "继续" : "暂停画面"}
          disabled={!live()}
          onClick={() => mirrorStore.setPaused(!mirrorStore.state.paused)}
        />
        <YoIconButton
          icon="export"
          title="截图"
          disabled={!live() || !mirrorStore.state.hasFrame}
          onClick={() => void screenshot()}
        />
        <YoIconButton
          icon={mirrorStore.state.fullscreen ? "window-restore" : "window-max"}
          title={mirrorStore.state.fullscreen ? "退出全屏" : "面板内全屏"}
          disabled={!live()}
          onClick={() => mirrorStore.setFullscreen(!mirrorStore.state.fullscreen)}
        />
        <YoButton
          size="sm"
          buttonStyle={mirrorStore.state.readOnly ? "emphasized" : "normal"}
          tone={mirrorStore.state.readOnly ? "accent" : "neutral"}
          aria-pressed={mirrorStore.state.readOnly}
          disabled={!props.selectedSerials[0] || starting()}
          onClick={() => void mirrorStore.setReadOnly(!mirrorStore.state.readOnly)}
        >
          仅显示
        </YoButton>
      </YoChrome>

      <div class="yohu-mirror__body">
        <div class="yohu-mirror__stage" aria-label="投屏画面">
          <div
            ref={(el) => {
              avail = el;
            }}
            class="yohu-mirror__avail"
            onPointerDown={(event) => reportAvailPointer(event, "down")}
            onPointerMove={(event) => reportAvailPointer(event, "move")}
            onPointerUp={(event) => reportAvailPointer(event, "up")}
            onPointerCancel={(event) => reportAvailPointer(event, "leave")}
            onPointerLeave={(event) => reportAvailPointer(event, "leave")}
          >
            <div class="yohu-mirror__hole" aria-hidden="true" />
          </div>
        </div>

        <YoPanel
          class="yohu-mirror__ops"
          variant="pane"
          padding="none"
          paddingBlock="xs"
          align="center"
          gap="2xs"
          aria-label="设备操作"
        >
          <YoScroller>
            <div class="yohu-mirror__ops-stack">
            <For each={NAV_OPS}>
              {(op) => (
                <YoIconButton
                  icon={op.icon}
                  title={op.title}
                  size="md"
                  disabled={!canControl()}
                  onClick={() => void runOp(op)}
                />
              )}
            </For>
            <YoIconButton
              icon={mirrorStore.state.night === true ? "display-off" : "display-on"}
              title={
                mirrorStore.state.night === null
                  ? "设备深浅色"
                  : mirrorStore.state.night === true
                    ? "设备深色"
                    : "设备浅色"
              }
              size="md"
              pressed={mirrorStore.state.night === true}
              disabled={!props.selectedSerials[0] || mirrorStore.state.night === null}
              onClick={() => void toggleDeviceNight()}
            />
            <For each={BRIGHTNESS_OPS}>
              {(op) => (
                <YoIconButton
                  icon={op.icon}
                  title={op.title}
                  size="md"
                  disabled={!canControl()}
                  onClick={() => void runOp(op)}
                />
              )}
            </For>
            </div>
          </YoScroller>
        </YoPanel>

        <YoPanel
          class="yohu-mirror__func"
          variant="pane"
          title="质量"
          actions={<YoBadge text="下次开始生效" tone="neutral" />}
          padding="md"
          gap="sm"
          overflow="hidden"
          aria-label="投屏功能栏"
        >
          <YoScroller>
            <YoFormRow title="投屏协议" layout="stacked">
              <YoSelect
                block
                options={PROTOCOL_OPTIONS}
                value={mirrorStore.state.protocol}
                disabled={qualityDisabled()}
                onChange={(v) => void persistQuality("mirror_protocol", v as "usb" | "wifi")}
              />
            </YoFormRow>
            <YoFormRow title="长边" layout="stacked">
              <YoSelect
                block
                options={withCurrentOption(SIZE_OPTIONS, mirrorStore.state.maxSize, sizeLabel)}
                value={String(mirrorStore.state.maxSize)}
                disabled={qualityDisabled()}
                onChange={(v) => void persistQuality("mirror_max_size", Number.parseInt(v, 10))}
              />
            </YoFormRow>
            <YoFormRow title="码率" layout="stacked">
              <YoSelect
                block
                options={withCurrentOption(RATE_OPTIONS, mirrorStore.state.videoBitRate, rateLabel)}
                value={String(mirrorStore.state.videoBitRate)}
                disabled={qualityDisabled()}
                onChange={(v) => void persistQuality("mirror_video_bit_rate", Number.parseInt(v, 10))}
              />
            </YoFormRow>
            <YoFormRow title="帧率" layout="stacked">
              <YoSelect
                block
                options={withCurrentOption(FPS_OPTIONS, mirrorStore.state.maxFps, fpsLabel)}
                value={String(mirrorStore.state.maxFps)}
                disabled={qualityDisabled()}
                onChange={(v) => void persistQuality("mirror_max_fps", Number.parseInt(v, 10))}
              />
            </YoFormRow>
          </YoScroller>
        </YoPanel>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
