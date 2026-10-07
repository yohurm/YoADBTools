/**
 * 设备栏（UI设计系统-v6.md §3）：展开为卡片，图标轨为状态点。
 * 行走 YoListItem + YoStatusDot；标题走 YoSubheader（计数徽章走 meta）；
 * 刷新是标题行兄弟，不进 actions。滚动走 YoScroller。
 * 选中 = `.yohu-interactive--selected` + 配方 selected（项内弹出，禁止滑块换行）；
 * 无设备 hug（`recipe=collapse` + `YoEmptyState size=sm`）；有列表才 `fill` 吃帽下剩余高。
 * 空态短引导；有 lastError 才出明细和重试。
 * 项滚动走 YoScroller。插拔走 `YoListPresence`（配方 list）；空态/徽章仍直切。
 * 键盘：roving tabindex（焦点行 0）+ Enter/Space 选择，role=listbox/option。
 * MultiOptional：单击替换勾选；Ctrl/Meta+click 加减选。高亮 = 解析后的执行目标。
 */

import { Component, Show, createSignal } from "solid-js";

import {
  YoBadge,
  YoButton,
  YoCollapse,
  YoEmptyState,
  YoIconButton,
  YoListItem,
  YoListPresence,
  YoRailSlot,
  YoScroller,
  YoStatusDot,
  YoSubheader,
  YoTooltip,
  isModKey,
  listActivateKey,
  railSlotOpen,
  railStreamAttr,
  railStreamOpen,
  railTooltipEnabled,
  trueAttr,
  useRail,
  type RailIntent,
} from "@yohu/ui";
import {
  deviceDisplayName,
  deviceIsOnline,
  deviceIsUnauthorized,
  selectionModeIsMulti,
  type DeviceInfo,
  type DeviceState,
} from "@yohu/api";

import type { SelectionMode } from "../registry";
import { deviceStore, settingsStore } from "../stores";
import { deviceCatalogIsEmpty, deviceScanHasError } from "../stores/device-store";
import {
  formatDeviceRailTip,
  formatDeviceStatusHint,
  formatDeviceStatusMeta,
  DEVICE_UNAUTHORIZED_LABEL,
} from "./device-status-format";

export const DeviceRail: Component<{
  moduleId?: string;
  selectionMode?: SelectionMode;
  /** 壳外单测可指定意图；工作台内跟 YoRail。 */
  intent?: RailIntent;
}> = (props) => {
  function rowSerial(device: DeviceInfo): string {
    return device.serial;
  }

  function rowState(device: DeviceInfo): DeviceState {
    return device.state;
  }

  function moduleId(): string | undefined {
    return props.moduleId;
  }

  function mode(): SelectionMode | undefined {
    return props.selectionMode;
  }

  function scanError(): string {
    return deviceStore.state.lastError;
  }

  function inlineAxis() {
    return "inline" as const;
  }

  const rail = useRail();
  const phase = () => rail?.phase() ?? props.intent ?? "expanded";
  const [expanded, setExpanded] = createSignal(true);
  const multi = () => selectionModeIsMulti(mode());
  const compact = () => !railStreamOpen(phase());
  const slotOpen = () => railSlotOpen(phase());
  const listOpen = () => compact() || expanded();

  const targets = (): string[] => {
    const id = moduleId();
    const selection = mode();
    if (id && selection) {
      return deviceStore.selectedSerials(id, selection);
    }
    const focused = deviceStore.focus();
    return focused ? [focused] : [];
  };

  const isSelected = (serial: string): boolean => targets().includes(serial);
  const empty = (): boolean => deviceCatalogIsEmpty(deviceStore.catalog());
  const scanFailed = (): boolean => deviceScanHasError(scanError());
  const emptyHint = (): string => (scanFailed() ? scanError() : "连接设备并授权后刷新");

  const select = (serial: string, event?: MouseEvent | KeyboardEvent): void => {
    deviceStore.selectDevice(serial, {
      moduleId: moduleId(),
      mode: mode(),
      additive: multi() && Boolean(event && isModKey(event)),
    });
  };

  const onItemKeyDown = (serial: string, event: KeyboardEvent): void => {
    if (listActivateKey(event.key)) {
      event.preventDefault();
      select(serial, event);
    }
  };

  return (
    <div
      class="yohu-device-rail"
      data-empty={trueAttr(empty())}
      data-stream={railStreamAttr(phase())}
    >
      <div class="yohu-device-rail__header">
          <YoRailSlot axis={inlineAxis()} open={slotOpen()}>
          <YoIconButton
            icon={listOpen() && !compact() ? "chevron-down" : "chevron-right"}
            title={expanded() ? "折叠设备列表" : "展开设备列表"}
            aria-expanded={listOpen()}
            onClick={() => setExpanded((v) => !v)}
          />
        </YoRailSlot>
        <YoRailSlot axis={inlineAxis()} class="yohu-device-rail__heading" open={slotOpen()}>
          <YoSubheader
            title="设备"
            tone="content"
            pad="flush"
            meta={
              !empty() ? (
                <YoBadge text={String(deviceStore.catalog().length)} tone={settingsStore.neutralTone()} />
              ) : undefined
            }
          />
        </YoRailSlot>
        <YoIconButton
          icon="refresh"
          title="刷新设备"
          loading={deviceStore.state.refreshing}
          onClick={deviceStore.refreshNow}
        />
      </div>
      <YoCollapse open={listOpen()} recipe={empty() ? "collapse" : "fill"} flex={empty() ? "hug" : "grow"}>
        <div class="yohu-device-rail__body">
          <Show
            when={!empty()}
            fallback={
              <YoRailSlot open={slotOpen()}>
                <YoEmptyState
                  size={settingsStore.smSize()}
                  title="无设备"
                  description={emptyHint()}
                  action={
                    scanFailed() ? (
                      <YoButton
                        size={settingsStore.smSize()}
                        buttonStyle={settingsStore.normalStyle()}
                        tone={settingsStore.neutralTone()}
                        onClick={deviceStore.refreshNow}
                      >
                        重试扫描
                      </YoButton>
                    ) : undefined
                  }
                />
              </YoRailSlot>
            }
          >
            <div
              class="yohu-device-rail__list"
              role="listbox"
              aria-label="设备列表"
              aria-multiselectable={multi() || undefined}
            >
              <YoScroller>
                <div class="yohu-device-rail__stack">
                    <YoListPresence each={deviceStore.catalog()} key={(device) => rowSerial(device)}>
                      {(device) => {
                        const serial = () => rowSerial(device);
                        const state = () => rowState(device);
                        const focused = () => deviceStore.focus() === serial();
                        const runtime = () => deviceStore.state.statuses[serial()];
                        const meta = () => formatDeviceStatusMeta(runtime());
                        const hint = () => formatDeviceStatusHint(runtime());
                        const first = (): boolean => {
                          const head = deviceStore.catalog()[0];
                          return head ? rowSerial(head) === serial() : false;
                        };
                        const name = () => deviceDisplayName(device);
                        const tip = () =>
                          formatDeviceRailTip({
                            name: name(),
                            serial: serial(),
                            state: state(),
                            hint: hint(),
                          });
                        const iconTip = () => railTooltipEnabled(phase());
                        const statusDot = () => (
                          <YoStatusDot
                            tone={deviceIsOnline(state()) ? "success" : "offline"}
                          />
                        );
                        return (
                          <YoListItem
                            size="device"
                            selected={isSelected(serial())}
                            tabIndex={
                              focused() || (deviceStore.focus() === null && first())
                                ? 0
                                : -1
                            }
                            label={iconTip() ? tip() : name()}
                            title={name()}
                            description={serial()}
                            meta={meta()}
                            leading={
                              iconTip() ? (
                                <YoTooltip content={tip()}>{statusDot()}</YoTooltip>
                              ) : (
                                statusDot()
                              )
                            }
                            trailing={
                              deviceIsUnauthorized(state()) ? (
                                <YoBadge text={DEVICE_UNAUTHORIZED_LABEL} tone="warning" />
                              ) : undefined
                            }
                            onClick={(event) => select(serial(), event)}
                            onKeyDown={(event) => onItemKeyDown(serial(), event)}
                          />
                        );
                      }}
                    </YoListPresence>
                  </div>
              </YoScroller>
            </div>
          </Show>
        </div>
      </YoCollapse>
    </div>
  );
};
