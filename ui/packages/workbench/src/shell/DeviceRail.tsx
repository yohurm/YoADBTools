/**
 * 设备栏（UI设计系统-v6.md §3）：卡片式设备列表。
 * 设备卡片：在线点 + 型号一行 + serial 等宽一行 + 可选运行时次行（Android/电量）+ 未授权徽章；
 * 选中 = `.yohu-interactive--selected`（全表面同一配方）；
 * 无设备 hug（`recipe=collapse` + `YoEmptyState size=sm`）；有列表才 `fill` 吃帽下剩余高。
 * 空态短引导；有 lastError 才出明细和重试。
 * 滑块在 list 宿主内裁切；项滚动走内层 scroller，避免弹簧过冲撑出 Windows 双滚动条。
 * 插拔走 `YoListPresence`（配方 list）；空态/徽章仍直切。
 * 键盘：roving tabindex（焦点行 0）+ Enter/Space 选择，role=listbox/option。
 * MultiOptional：单击替换勾选；Ctrl/Meta+click 加减选。高亮 = 解析后的执行目标。
 */

import { Component, Show, createSignal } from "solid-js";

import { YoBadge, YoButton, YoCollapse, YoEmptyState, YoIconButton, YoIndicator, YoListPresence } from "@yohu/ui";
import { deviceDisplayName } from "@yohu/api";

import type { SelectionMode } from "../registry";
import { deviceStore } from "../stores";
import { formatDeviceStatusHint, formatDeviceStatusMeta } from "./device-status-format";

export const DeviceRail: Component<{
  moduleId?: string;
  selectionMode?: SelectionMode;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(true);
  const multi = () => props.selectionMode === "multiOptional";

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
  const indicatorFollow = (): string | undefined => {
    const ids = targets();
    return ids.length === 1 ? ids[0] : undefined;
  };

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
    <div class="yohu-device-rail" data-empty={empty() ? true : undefined}>
      <div class="yohu-device-rail__header">
        <YoIconButton
          icon={expanded() ? "chevron-down" : "chevron-right"}
          title={expanded() ? "折叠设备列表" : "展开设备列表"}
          aria-expanded={expanded()}
          onClick={() => setExpanded((v) => !v)}
        />
        <div class="yohu-device-rail__heading">
          <span class="yohu-device-rail__title">设备</span>
          <Show when={deviceStore.state.devices.length > 0}>
            <YoBadge text={String(deviceStore.state.devices.length)} tone="neutral" />
          </Show>
        </div>
        <YoIconButton
          icon="refresh"
          title="刷新设备"
          loading={deviceStore.state.refreshing}
          onClick={() => void deviceStore.refresh()}
        />
      </div>
      <YoCollapse open={expanded()} recipe={empty() ? "collapse" : "fill"}>
        <div class="yohu-device-rail__body">
          <Show
            when={!empty()}
            fallback={
              <YoEmptyState
                size="sm"
                title="无设备"
                description={emptyHint()}
                action={
                  deviceStore.state.lastError ? (
                    <YoButton
                      size="sm"
                      variant="outlined"
                      tone="neutral"
                      onClick={() => void deviceStore.refresh()}
                    >
                      重试扫描
                    </YoButton>
                  ) : undefined
                }
              />
            }
          >
            <div
              class="yohu-device-rail__list"
              role="listbox"
              aria-label="设备列表"
              aria-multiselectable={multi() || undefined}
            >
              <YoIndicator follow={indicatorFollow()} variant="fill" />
              <div class="yohu-device-rail__scroller">
                <YoListPresence each={deviceStore.state.devices} key={(device) => device.serial}>
                  {(device) => {
                    const focused = () => deviceStore.state.focusSerial === device.serial;
                    const runtime = () => deviceStore.state.statuses[device.serial];
                    const meta = () => formatDeviceStatusMeta(runtime());
                    const hint = () => formatDeviceStatusHint(runtime());
                    const first = () => deviceStore.state.devices[0]?.serial === device.serial;
                    return (
                      <div
                        class="yohu-device-rail__item yohu-interactive yohu-focus-ring"
                        classList={{
                          "yohu-interactive--selected": isSelected(device.serial),
                        }}
                        role="option"
                        aria-selected={isSelected(device.serial)}
                        title={hint() || undefined}
                        tabIndex={focused() || (deviceStore.state.focusSerial === null && first()) ? 0 : -1}
                        onClick={(event) => select(device.serial, event)}
                        onKeyDown={(event) => onItemKeyDown(device.serial, event)}
                      >
                        <span
                          class="yohu-device-rail__dot"
                          classList={{
                            "yohu-device-rail__dot--online": device.state === "online",
                            "yohu-device-rail__dot--off": device.state !== "online",
                          }}
                          aria-hidden="true"
                        />
                        <span class="yohu-device-rail__info">
                          <span class="yohu-device-rail__model">{deviceDisplayName(device)}</span>
                          <span class="yohu-device-rail__serial">{device.serial}</span>
                          <Show when={meta()}>
                            <span class="yohu-device-rail__meta">{meta()}</span>
                          </Show>
                        </span>
                        <Show when={device.state === "unauthorized"}>
                          <YoBadge text="未授权" tone="warning" />
                        </Show>
                      </div>
                    );
                  }}
                </YoListPresence>
              </div>
            </div>
          </Show>
        </div>
      </YoCollapse>
    </div>
  );
};
