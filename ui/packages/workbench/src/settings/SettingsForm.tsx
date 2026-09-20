/**
 * 设置表单：分组卡片与表单项。浏览/打开/保存走 store；本文件只交事件。
 */

import { For, type JSX } from "solid-js";

import { APP_ICON_SRC } from "../app-identity";
import {
  LOG_COLOR_SCHEME_CATALOG,
  LOG_DISPLAY_COLUMN_CATALOG,
  LOG_LINE_LAYOUT_CATALOG,
  ModuleTitle,
  type Density,
  type SettingKey,
  type TerminalTimeFormat,
  type Theme,
} from "@yohu/api";
import {
  Layout,
  YoBadge,
  YoButton,
  YoCheckbox,
  YoFormRow,
  YoPanel,
  YoScroller,
  YoSelect,
  YoSwitch,
  YoTextField,
} from "@yohu/ui";

import { settingsStore, updateStore } from "../stores";
import { PathChrome } from "./PathChrome";
import { effectivePath } from "./path-display";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "comfortable", label: "舒适" },
  { value: "compact", label: "紧凑" },
];

const CLOCK_FORMAT_LABEL: Record<TerminalTimeFormat, string> = {
  time_millis: "时分秒.毫秒",
  time: "时分秒",
  datetime_millis: "日期 + 时分秒.毫秒",
  datetime: "日期 + 时分秒",
};

function clockFormatOptions(
  order: TerminalTimeFormat[],
): { value: TerminalTimeFormat; label: string }[] {
  return order.map((value) => ({
    value,
    label: CLOCK_FORMAT_LABEL[value],
  }));
}

const TERMINAL_TIME_FORMAT_OPTIONS = clockFormatOptions([
  "time_millis",
  "time",
  "datetime_millis",
  "datetime",
]);

const LOG_TIME_FORMAT_OPTIONS = clockFormatOptions([
  "datetime_millis",
  "datetime",
  "time_millis",
  "time",
]);

const LOG_COLOR_SCHEME_OPTIONS = LOG_COLOR_SCHEME_CATALOG.map(({ value, label }) => ({
  value,
  label,
}));

const LOG_LINE_LAYOUT_OPTIONS = LOG_LINE_LAYOUT_CATALOG.map(({ value, label }) => ({
  value,
  label,
}));

function EffectBadge(props: { text: string }): JSX.Element {
  return <YoBadge text={props.text} tone={props.text === "立即生效" ? "accent" : "neutral"} />;
}

export function SettingsForm(props: {
  save: (key: SettingKey, value: unknown, okText: string) => void;
  savedBrowse: (run: () => Promise<string | null>, okText: string) => void;
  onCheckUpdate: () => void;
}): JSX.Element {
  return (
    <YoScroller class="yohu-settings__scroll">
      <div class="yohu-settings__stack">
      <YoPanel title="工具链" overflow="visible">
        <YoFormRow title="ADB 路径" note={<EffectBadge text="立即生效" />}>
          <PathChrome
            label="ADB 路径"
            path={effectivePath(settingsStore.state.adb_path, settingsStore.resolved.adb_path)}
            actionLabel="浏览"
            onAction={() =>
              props.savedBrowse(() => settingsStore.browseAdbPath(), "已保存（立即生效）")
            }
          />
        </YoFormRow>

        <YoFormRow title="数据目录" note={<EffectBadge text="重启生效" />}>
          <PathChrome
            label="数据目录"
            path={effectivePath(settingsStore.state.data_root, settingsStore.resolved.data_root)}
            actionLabel="浏览"
            onAction={() =>
              props.savedBrowse(() => settingsStore.browseDataRoot(), "已保存（重启生效）")
            }
          />
        </YoFormRow>

        <YoFormRow title="设备自动刷新" note={<EffectBadge text="立即生效" />}>
          <YoSwitch
            ariaLabel="设备自动刷新"
            checked={settingsStore.state.devices_auto_refresh}
            onChange={(v) => props.save("devices_auto_refresh", v, "已保存（立即生效）")}
          />
        </YoFormRow>
      </YoPanel>

      <YoPanel title={ModuleTitle.Terminal} overflow="visible">
        <YoFormRow title="输入命令默认加上 adb" note={<EffectBadge text="立即生效" />}>
          <YoSwitch
            ariaLabel="输入命令默认加上 adb"
            checked={settingsStore.state.terminal_prepend_adb}
            onChange={(v) => props.save("terminal_prepend_adb", v, "已保存（立即生效）")}
          />
        </YoFormRow>
        <YoFormRow title="结果显示时间格式" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={TERMINAL_TIME_FORMAT_OPTIONS}
            value={settingsStore.state.terminal_time_format}
            onChange={(v) => props.save("terminal_time_format", v, "已保存（立即生效）")}
          />
        </YoFormRow>
      </YoPanel>

      <YoPanel title={ModuleTitle.Files} overflow="visible">
        <YoFormRow title="拖入时指向文件夹" note={<EffectBadge text="立即生效" />}>
          <YoSwitch
            ariaLabel="拖入时指向文件夹"
            checked={settingsStore.state.files_drop_into_folder}
            onChange={(v) => props.save("files_drop_into_folder", v, "已保存（立即生效）")}
          />
        </YoFormRow>
      </YoPanel>

      <YoPanel title={ModuleTitle.Logs} overflow="visible">
        <YoFormRow title="清单时间显示" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={LOG_TIME_FORMAT_OPTIONS}
            value={settingsStore.state.log_time_format}
            onChange={(v) => props.save("log_time_format", v, "已保存（立即生效）")}
          />
        </YoFormRow>
        <YoFormRow title="内容配色" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={LOG_COLOR_SCHEME_OPTIONS}
            value={settingsStore.state.log_color_scheme}
            onChange={(v) => props.save("log_color_scheme", v, "已保存（立即生效）")}
          />
        </YoFormRow>
        <YoFormRow title="长文本" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={LOG_LINE_LAYOUT_OPTIONS}
            value={settingsStore.state.log_line_layout}
            onChange={(v) => props.save("log_line_layout", v, "已保存（立即生效）")}
          />
        </YoFormRow>
        <YoFormRow
          title="缓冲最大行数"
          note={<EffectBadge text="窗口立即裁剪，采集环下次启动" />}
        >
          <YoTextField
            type="number"
            min={1}
            value={String(settingsStore.state.buffer_capacity)}
            ariaLabel="缓冲最大行数"
            onInput={(v) =>
              props.save("buffer_capacity", v, "已保存（窗口立即裁剪，采集环下次启动）")
            }
          />
        </YoFormRow>

        <YoFormRow
          title="开始采集前清空设备缓冲（logcat -c）"
          note={<EffectBadge text="下次采集生效" />}
        >
          <YoSwitch
            ariaLabel="开始采集前清空设备缓冲（logcat -c）"
            checked={settingsStore.state.clear_device_on_start}
            onChange={(v) => props.save("clear_device_on_start", v, "已保存（下次采集生效）")}
          />
        </YoFormRow>

        <YoFormRow title="默认导出路径" note={<EffectBadge text="立即生效" />}>
          <PathChrome
            label="默认导出路径"
            path={effectivePath(
              settingsStore.state.export_default_path,
              settingsStore.resolved.export_default_path,
            )}
            actionLabel="浏览"
            onAction={() =>
              props.savedBrowse(() => settingsStore.browseExportPath(), "已保存（立即生效）")
            }
          />
        </YoFormRow>

        <YoFormRow title="每次导出询问保存位置" note={<EffectBadge text="立即生效" />}>
          <YoSwitch
            ariaLabel="每次导出询问保存位置"
            checked={settingsStore.state.export_ask_every_time}
            onChange={(v) => props.save("export_ask_every_time", v, "已保存（立即生效）")}
          />
        </YoFormRow>

        <YoFormRow title="日志显示列" note={<EffectBadge text="立即生效" />}>
          <div class="yohu-settings__checks">
            <For each={LOG_DISPLAY_COLUMN_CATALOG}>
              {(opt) => (
                <YoCheckbox
                  label={opt.label}
                  checked={settingsStore.state.log_display_columns[opt.key]}
                  onChange={(v) =>
                    props.save(
                      "log_display_columns",
                      { ...settingsStore.state.log_display_columns, [opt.key]: v },
                      "已保存（立即生效）",
                    )
                  }
                />
              )}
            </For>
          </div>
        </YoFormRow>
      </YoPanel>

      <YoPanel title={ModuleTitle.Mirror} overflow="visible">
        <YoFormRow
          title="强制 ADB forward"
          description="协议、长边、码率、帧率在投屏显示页调节。无线调试默认 forward；USB 上 reverse 失败也会回退。需要跳过 reverse 时打开此开关。"
          note={<EffectBadge text="下次启动生效" />}
        >
          <YoSwitch
            ariaLabel="强制 ADB forward（跳过 reverse）"
            checked={settingsStore.state.mirror_force_forward}
            onChange={(v) => props.save("mirror_force_forward", v, "已保存（下次启动生效）")}
          />
        </YoFormRow>
      </YoPanel>

      <YoPanel title="外观" overflow="visible">
        <YoFormRow title="主题" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={THEME_OPTIONS}
            value={settingsStore.state.theme}
            onChange={(v) => props.save("theme", v, "已保存（立即生效）")}
          />
        </YoFormRow>

        <YoFormRow title="密度" note={<EffectBadge text="立即生效" />}>
          <YoSelect
            options={DENSITY_OPTIONS}
            value={settingsStore.state.density}
            onChange={(v) => props.save("density", v, "已保存（立即生效）")}
          />
        </YoFormRow>
      </YoPanel>

      <YoPanel title="关于" overflow="visible">
        <div class="yohu-settings__about">
          <img
            class="yohu-settings__about-icon"
            src={APP_ICON_SRC}
            alt=""
            width={Layout.TitlebarCaption}
            height={Layout.TitlebarCaption}
          />
          <div class="yohu-settings__about-copy">
            <div class="yohu-settings__about-name">{settingsStore.identity.display_name}</div>
            <div class="yohu-settings__about-desc">{settingsStore.identity.description}</div>
          </div>
        </div>
        <YoFormRow title="版本">
          {settingsStore.identity.version}
          <YoButton
            size="sm"
            buttonStyle="normal"
            tone="neutral"
            loading={updateStore.checking()}
            disabled={updateStore.checking()}
            onClick={() => props.onCheckUpdate()}
          >
            检查更新
          </YoButton>
        </YoFormRow>
        <YoFormRow title="标识">
          {settingsStore.identity.identifier}
        </YoFormRow>
        <YoFormRow title="版权">
          {settingsStore.identity.copyright}
        </YoFormRow>
        <YoFormRow title="应用日志">
          <PathChrome
            label="应用日志"
            path={settingsStore.paths.logs_dir}
            actionLabel="打开"
            disabled={!settingsStore.paths.logs_dir}
            onAction={() => void settingsStore.openLogsDir()}
          />
        </YoFormRow>
      </YoPanel>
      </div>
    </YoScroller>
  );
}
