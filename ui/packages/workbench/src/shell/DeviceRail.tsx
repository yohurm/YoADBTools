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
  railSlotOpen,
  railStreamAttr,
  railStreamOpen,
  railTooltipEnabled,
  useRail,
  type RailIntent,
} from "@yohu/ui";
import { deviceDisplayName } from "@yohu/api";

import type { SelectionMode } from "../registry";
import { deviceStore } from "../stores";
import {
  formatDeviceRailTip,
  formatDeviceStatusHint,
  formatDeviceStatusMeta,
} from "./device-status-format";

export const DeviceRail: Component<{
  moduleId?: string;
  selectionMode?: SelectionMode;
  /** 壳外单测可指定意图；工作台内跟 YoRail。 */
  intent?: RailIntent;
}> = (props) => {
  const rail = useRail();
  const phase = () => rail?.phase() ?? props.intent ?? "expanded";
  const [expanded, setExpanded] = createSignal(true);
  const multi = () => props.selectionMode === "multiOptional";
  const compact = () => !railStreamOpen(phase());
  const slotOpen = () => railSlotOpen(phase());
  const listOpen = () => compact() || expanded();

  const targets = (): string[] => {
    if (props.moduleId && props.selectionMode) {
      return deviceStore.selectedSerials(props.moduleId, props.selectionMode);
    }
    return deviceStore.state.focusSerial ? [deviceStore.state.focusSerial] : [];
  };

  const isSelected = (serial: string): boolean => targets().includes(serial);
  const empty = (): boolean => deviceStore.state.devices.length === 0;
  const emptyHint = (): string =>
    deviceStore.state.lastError || "连接设备并授权后刷新";

  const select = (serial: string, event?: MouseEvent | KeyboardEvent): void => {
    deviceStore.selectDevice(serial, {
      moduleId: props.moduleId,
      mode: props.selectionMode,
      additive: multi() && Boolean(event && (event.ctrlKey || event.metaKey)),
    });
  };

  const onItemKeyDown = (serial: string, event: KeyboardEvent): void => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(serial, event);
    }
  };

  return (
    <div
      class="yohu-device-rail"
      data-empty={empty() ? true : undefined}
      data-stream={railStreamAttr(phase())}
    >
      <div class="yohu-device-rail__header">
        <YoRailSlot axis="inline" open={slotOpen()}>
          <YoIconButton
            icon={listOpen() && !compact() ? "chevron-down" : "chevron-right"}
            title={expanded() ? "折叠设备列表" : "展开设备列表"}
            aria-expanded={listOpen()}
            onClick={() => setExpanded((v) => !v)}
          />
        </YoRailSlot>
        <YoRailSlot axis="inline" class="yohu-device-rail__heading" open={slotOpen()}>
          <YoSubheader
            title="设备"
            tone="content"
            pad="flush"
            meta={
              deviceStore.state.devices.length > 0 ? (
                <YoBadge text={String(deviceStore.state.devices.length)} tone="neutral" />
              ) : undefined
            }
          />
        </YoRailSlot>
        <YoIconButton
          icon="refresh"
          title="刷新设备"
          loading={deviceStore.state.refreshing}
          onClick={() => void deviceStore.refresh()}
        />
      </div>
      <YoCollapse open={listOpen()} recipe={empty() ? "collapse" : "fill"}>
        <div class="yohu-device-rail__body">
          <Show
            when={!empty()}
            fallback={
              <YoRailSlot open={slotOpen()}>
                <YoEmptyState
                  size="sm"
                  title="无设备"
                  description={emptyHint()}
                  action={
                    deviceStore.state.lastError ? (
                      <YoButton
                        size="sm"
                        buttonStyle="normal"
                        tone="neutral"
                        onClick={() => void deviceStore.refresh()}
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
                    <YoListPresence each={deviceStore.state.devices} key={(device) => device.serial}>
                      {(device) => {
                        const focused = () => deviceStore.state.focusSerial === device.serial;
                        const runtime = () => deviceStore.state.statuses[device.serial];
                        const meta = () => formatDeviceStatusMeta(runtime());
                        const hint = () => formatDeviceStatusHint(runtime());
                        const first = () => deviceStore.state.devices[0]?.serial === device.serial;
                        const name = () => deviceDisplayName(device);
                        const tip = () =>
                          formatDeviceRailTip({
                            name: name(),
                            serial: device.serial,
                            unauthorized: device.state === "unauthorized",
                            hint: hint(),
                          });
                        const iconTip = () => railTooltipEnabled(phase());
                        const statusDot = () => (
                          <YoStatusDot
                            tone={device.state === "online" ? "success" : "offline"}
                          />
                        );
                        return (
                          <YoListItem
                            size="device"
                            selected={isSelected(device.serial)}
                            tabIndex={
                              focused() || (deviceStore.state.focusSerial === null && first())
                                ? 0
                                : -1
                            }
                            label={iconTip() ? tip() : name()}
                            title={name()}
                            description={device.serial}
                            meta={meta()}
                            leading={
                              iconTip() ? (
                                <YoTooltip content={tip()}>{statusDot()}</YoTooltip>
                              ) : (
                                statusDot()
                              )
                            }
                            trailing={
                              device.state === "unauthorized" ? (
                                <YoBadge text="未授权" tone="warning" />
                              ) : undefined
                            }
                            onClick={(event) => select(device.serial, event)}
                            onKeyDown={(event) => onItemKeyDown(device.serial, event)}
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
