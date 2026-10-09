/**
 * 投屏主视图：只量 `.yohu-mirror__avail`；会话旗标与 invoke 在 store。
 */

import { For, Show, createEffect, onCleanup, onMount, type JSX } from "solid-js";
import { AndroidKey, boundSerial, connectionOrUsb, DIALOG_FAILED, deviceNightWord, errorText, mirrorIsLive, mirrorIsStarting, mirrorPointerCaptures, mirrorPointerReleases, mirrorProtocolOf, ModuleTitle, saveFailedText, type DeviceSession, type MirrorPointerKind, type MirrorProtocol } from "@yohu/api";
import { screenshotOutcomeIsFailed, screenshotOutcomeIsSaved } from "./screenshot";
import {
  dismissKey,
  YoBadge,
  YoButton,
  documentIsVisible,
  hostPixelRatio,
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
  themeIsDark,
  onResolvedThemeChange,
  type IconName,
} from "@yohu/ui";

import { clientPointerPx, clientZoneRect, type ViewportOffset } from "./layout";
import {
  FPS_OPTIONS,
  PROTOCOL_OPTIONS,
  RATE_OPTIONS,
  SIZE_OPTIONS,
  fpsLabel,
  rateLabel,
  sizeLabel,
  withCurrentOption,
  type QualityOption,
} from "./quality";
import { mirrorControlReady, mirrorHoleCopy, mirrorPictureReady, mirrorPlaybackReady, mirrorSetupEnabled } from "./control-ready";
import { mirrorStore, type MirrorPhase } from "./store";
import "./mirror.css";

type DeviceOp = { icon: IconName; title: string; keycode: number };

const DEVICE_NIGHT_CONTROL = "设备深浅色";

/** 设备深浅色已经从状态里读到。标题、禁用和切换都问这一把。 */
function nightKnown(night: boolean | null): night is boolean {
  return night !== null;
}

function nightToggleTarget(
  serial: string | null,
  night: boolean | null,
): { serial: string; night: boolean } | null {
  if (serial === null || !nightKnown(night)) return null;
  return { serial, night };
}

function nightIsOn(night: boolean | null): boolean {
  return nightKnown(night) && night;
}

function deviceNightControlTitle(night: boolean | null): string {
  return nightKnown(night) ? `设备${deviceNightWord(night)}` : DEVICE_NIGHT_CONTROL;
}

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

function viewportAxis(value: number | undefined): number {
  return value ?? 0;
}

function qualityNumber(v: string): number {
  return Number.parseInt(v, 10);
}

function selectValue(n: number): string {
  return String(n);
}

function caughtText(e: unknown): string {
  return errorText(e);
}

/** 页头两颗文字钮都是小号。操作栏中号和图标间隔不并。 */
function headerButtonSize(): "sm" {
  return "sm";
}

/** 操作栏图标钮都是中号。质量栏 padding 不并。 */
function opsIconSize(): "md" {
  return "md";
}

function QualityRow(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <YoFormRow title={props.title} layout="stacked">
      {props.children}
    </YoFormRow>
  );
}

export function MirrorView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  let avail: HTMLDivElement | undefined;
  let zoneObserver: ResizeObserver | undefined;
  let stopTheme: (() => void) | undefined;
  let layoutRaf = 0;

  function applySessionSettings(): void {
    mirrorStore.applySettings(props.settings);
  }

  function chosenSerials(): string[] {
    return props.selectedSerials;
  }

  function selectedSerial(): string | null {
    return boundSerial(chosenSerials());
  }

  function sessionPhase(): MirrorPhase {
    return mirrorStore.state.phase;
  }

  function nightNow(): boolean | null {
    return mirrorStore.state.night;
  }

  function fullscreenOn(): boolean {
    return mirrorStore.state.fullscreen;
  }

  function pausedOn(): boolean {
    return mirrorStore.state.paused;
  }

  function readOnlyOn(): boolean {
    return mirrorStore.state.readOnly;
  }

  function sizeNow(): number {
    return mirrorStore.state.maxSize;
  }

  function rateNow(): number {
    return mirrorStore.state.videoBitRate;
  }

  function fpsNow(): number {
    return mirrorStore.state.maxFps;
  }

  function showFailure(text: string): void {
    toaster.show(text, "error");
  }

  function readClientFrame(): { dpr: number; offset: ViewportOffset } {
    const vv = window.visualViewport;
    return {
      dpr: hostPixelRatio(),
      offset: { left: viewportAxis(vv?.offsetLeft), top: viewportAxis(vv?.offsetTop) },
    };
  }

  const pushLayout = (): void => {
    if (layoutRaf !== 0) return;
    layoutRaf = window.requestAnimationFrame(() => {
      layoutRaf = 0;
      if (!avail) return;
      const zone = avail.getBoundingClientRect();
      const frame = readClientFrame();
      const rect = clientZoneRect(zone, frame.dpr, frame.offset);
      mirrorStore.reportAvail({
        ...rect,
        visible: documentIsVisible(),
        dpr: frame.dpr,
        dark: themeIsDark(getTheme()),
      });
    });
  };

  let stopScroll: (() => void) | undefined;
  let stopKey: (() => void) | undefined;
  let stopVisibility: (() => void) | undefined;

  function listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    capture?: boolean,
  ): () => void;
  function listen<K extends keyof DocumentEventMap>(
    target: Document,
    type: K,
    handler: (event: DocumentEventMap[K]) => void,
    capture?: boolean,
  ): () => void;
  function listen(
    target: Window | Document,
    type: string,
    handler: (event: Event) => void,
    capture?: boolean,
  ): () => void {
    target.addEventListener(type, handler, capture);
    return () => target.removeEventListener(type, handler, capture);
  }

  onMount(() => {
    applySessionSettings();
    pushLayout();
    if (avail) {
      zoneObserver = new ResizeObserver(pushLayout);
      zoneObserver.observe(avail);
    }
    stopTheme = onResolvedThemeChange(pushLayout);
    stopScroll = listen(window, "scroll", pushLayout, true);
    stopKey = listen(window, "keydown", onEsc);
    stopVisibility = listen(document, "visibilitychange", pushLayout);
  });
  onCleanup(() => {
    if (layoutRaf !== 0) window.cancelAnimationFrame(layoutRaf);
    layoutRaf = 0;
    zoneObserver?.disconnect();
    stopTheme?.();
    stopScroll?.();
    stopKey?.();
    stopVisibility?.();
    mirrorStore.leaveAvail();
  });

  function onEsc(e: KeyboardEvent): void {
    if (!dismissKey(e.key) || !fullscreenOn()) return;
    e.preventDefault();
    mirrorStore.setFullscreen(false);
  }

  function reportAvailPointer(event: PointerEvent, kind: MirrorPointerKind): void {
    if (controlLocked()) return;
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;
    if (mirrorPointerCaptures(kind)) {
      target.setPointerCapture(event.pointerId);
    } else if (mirrorPointerReleases(kind) && target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    const frame = readClientFrame();
    const pt = clientPointerPx(event.clientX, event.clientY, frame.dpr, frame.offset);
    mirrorStore.reportPointer(kind, pt.x, pt.y);
  }

  function reportPointerLeave(event: PointerEvent): void {
    reportAvailPointer(event, "leave");
  }

  createEffect(() => {
    const serial = selectedSerial();
    void mirrorStore.bindSerial(serial);
    mirrorStore.bindConnection(connectionOrUsb(props.selectedDevices[0]?.connection));
  });

  createEffect(() => {
    const serial = selectedSerial();
    if (!serial) {
      mirrorStore.bindNight(null);
      return;
    }
    mirrorStore.bindNight(props.deviceStatuses[serial]?.night ?? null);
  });

  createEffect(() => {
    applySessionSettings();
  });

  const live = () => mirrorIsLive(sessionPhase());
  const canControl = () => mirrorControlReady(mirrorStore.state);
  const starting = () => mirrorIsStarting(sessionPhase());
  const qualityDisabled = () => starting();

  function controlLocked(): boolean {
    return !canControl();
  }

  function setupEnabled(): boolean {
    return mirrorSetupEnabled(chosenSerials(), sessionPhase());
  }

  function playbackLocked(): boolean {
    return !mirrorPlaybackReady(mirrorStore.state);
  }

  function stageHole(): { title: string; body: string } | null {
    return mirrorHoleCopy(mirrorStore.state);
  }

  function nightTarget(): { serial: string; night: boolean } | null {
    return nightToggleTarget(selectedSerial(), nightNow());
  }

  function nightOn(): boolean {
    return nightIsOn(nightNow());
  }

  async function tapKey(keycode: number): Promise<void> {
    await mirrorStore.inject({ kind: "key", keycode, down: true });
    await mirrorStore.inject({ kind: "key", keycode, down: false });
  }

  async function runOp(op: DeviceOp): Promise<void> {
    await tapKey(op.keycode);
  }

  function DeviceOpButton(props: { op: DeviceOp }): JSX.Element {
    return (
      <YoIconButton
        icon={props.op.icon}
        title={props.op.title}
        size={opsIconSize()}
        disabled={controlLocked()}
        onClick={() => void runOp(props.op)}
      />
    );
  }

  function QualitySelect(props: {
    options: QualityOption[];
    value: string;
    onChange: (value: string) => void;
  }): JSX.Element {
    return (
      <YoSelect
        block
        options={props.options}
        value={props.value}
        disabled={qualityDisabled()}
        onChange={props.onChange}
      />
    );
  }

  async function toggleDeviceNight(): Promise<void> {
    const target = nightTarget();
    if (!target) return;
    try {
      await mirrorStore.setDeviceNight(target.serial, !target.night);
    } catch (e) {
      showFailure(`切换${DEVICE_NIGHT_CONTROL}失败: ${caughtText(e)}`);
    }
  }

  async function screenshot(): Promise<void> {
    try {
      const outcome = await mirrorStore.saveScreenshot();
      if (screenshotOutcomeIsSaved(outcome)) toaster.show("截图已保存", "success");
      else if (screenshotOutcomeIsFailed(outcome)) showFailure(DIALOG_FAILED);
    } catch (e) {
      showFailure(saveFailedText(caughtText(e)));
    }
  }

  async function persistQuality(
    key: "mirror_protocol" | "mirror_max_size" | "mirror_video_bit_rate" | "mirror_max_fps",
    value: number | MirrorProtocol,
  ): Promise<void> {
    try {
      await mirrorStore.persistQuality(key, value);
    } catch (e) {
      showFailure(`质量写入失败: ${caughtText(e)}`);
    }
  }

  return (
    <YoPage class={`yohu-mirror${fullscreenOn() ? " yohu-mirror--full" : ""}`}>
      <YoChrome
        title={ModuleTitle.Mirror}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        actions={[
          {
            key: "capture",
            node: (
              <YoButton
                size={headerButtonSize()}
                buttonStyle="emphasized"
                disabled={!setupEnabled()}
                loading={starting()}
                onClick={() => {
                  if (live()) void mirrorStore.stop();
                  else void mirrorStore.start();
                }}
              >
                {live() ? "停止" : "开始"}
              </YoButton>
            ),
          },
          {
            key: "pause",
            node: (
              <YoIconButton
                icon={pausedOn() ? "play" : "pause"}
                title={pausedOn() ? "继续" : "暂停画面"}
                disabled={playbackLocked()}
                onClick={() => mirrorStore.setPaused(!pausedOn())}
              />
            ),
          },
          {
            key: "screenshot",
            node: (
              <YoIconButton
                icon="export"
                title="截图"
                disabled={!mirrorPictureReady(mirrorStore.state)}
                onClick={() => void screenshot()}
              />
            ),
          },
          {
            key: "fullscreen",
            node: (
              <YoIconButton
                icon={fullscreenOn() ? "window-restore" : "window-max"}
                title={fullscreenOn() ? "退出全屏" : "面板内全屏"}
                disabled={playbackLocked()}
                onClick={() => mirrorStore.setFullscreen(!fullscreenOn())}
              />
            ),
          },
          {
            key: "readonly",
            node: (
              <YoButton
                size={headerButtonSize()}
                buttonStyle={readOnlyOn() ? "emphasized" : "normal"}
                tone={readOnlyOn() ? "accent" : "neutral"}
                aria-pressed={readOnlyOn()}
                disabled={!setupEnabled()}
                onClick={() => void mirrorStore.setReadOnly(!readOnlyOn())}
              >
                仅显示
              </YoButton>
            ),
          },
        ]}
      />

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
            onPointerCancel={reportPointerLeave}
            onPointerLeave={reportPointerLeave}
          >
            <div class="yohu-mirror__hole" aria-hidden={stageHole() ? undefined : "true"}>
              <Show when={stageHole()}>
                {(copy) => (
                  <div class="yohu-mirror__hole-copy">
                    <p class="yohu-mirror__hole-title">{copy().title}</p>
                    <p class="yohu-mirror__hole-body">{copy().body}</p>
                  </div>
                )}
              </Show>
            </div>
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
                {(op) => <DeviceOpButton op={op} />}
              </For>
              <YoIconButton
                icon={nightOn() ? "display-off" : "display-on"}
                title={deviceNightControlTitle(nightNow())}
                size={opsIconSize()}
                pressed={nightOn()}
                disabled={nightTarget() === null}
                onClick={() => void toggleDeviceNight()}
              />
              <For each={BRIGHTNESS_OPS}>
                {(op) => <DeviceOpButton op={op} />}
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
            <QualityRow title="投屏协议">
              <QualitySelect
                options={PROTOCOL_OPTIONS}
                value={mirrorStore.state.protocol}
                onChange={(v) => {
                  const protocol = mirrorProtocolOf(v);
                  if (!protocol) return;
                  void persistQuality("mirror_protocol", protocol);
                }}
              />
            </QualityRow>
            <QualityRow title="长边">
              <QualitySelect
                options={withCurrentOption(SIZE_OPTIONS, sizeNow(), sizeLabel)}
                value={selectValue(sizeNow())}
                onChange={(v) => void persistQuality("mirror_max_size", qualityNumber(v))}
              />
            </QualityRow>
            <QualityRow title="码率">
              <QualitySelect
                options={withCurrentOption(RATE_OPTIONS, rateNow(), rateLabel)}
                value={selectValue(rateNow())}
                onChange={(v) => void persistQuality("mirror_video_bit_rate", qualityNumber(v))}
              />
            </QualityRow>
            <QualityRow title="帧率">
              <QualitySelect
                options={withCurrentOption(FPS_OPTIONS, fpsNow(), fpsLabel)}
                value={selectValue(fpsNow())}
                onChange={(v) => void persistQuality("mirror_max_fps", qualityNumber(v))}
              />
            </QualityRow>
          </YoScroller>
        </YoPanel>
      </div>
      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
