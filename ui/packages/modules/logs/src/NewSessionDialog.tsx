/**
 * 新建日志窗口：设备 + 划分（包名/PID）。
 * 包名列表来自已安装应用（`log.packageSnapshot`）；PID 列表来自当前进程（`ps`）。
 * 检索框同时是过滤和创建值。清单走 YoVirtualList；设备行走 YoFormRow。
 */

import { Show, createContext, createEffect, createMemo, createSignal, untrack, useContext } from "solid-js";

import type { DeviceInfo } from "@yohu/api";
import {
  YoButton,
  YoCheckbox,
  YoCorner,
  YoDialog,
  YoFormRow,
  YoIndicator,
  YoSegmentedButton,
  YoSelect,
  YoTextField,
  YoVirtualList,
} from "@yohu/ui";

import type { SessionScope } from "./filter";
import { controlRowHeight, NEW_SESSION_DIALOG_HEIGHT } from "./layout";
import { devicePickerLabel } from "./session-device";
import { logStore } from "./store";

type PickerItem = { key: string; name: string; pid?: number };

const NewSessionActivate = createContext<(item: PickerItem) => void>();

function NewSessionRow(props: { item: PickerItem; index: number }) {
  const activate = useContext(NewSessionActivate);
  return (
    <div class="yohu-logs__new-item" onDblClick={() => activate?.(props.item)}>
      <span class="yohu-logs__new-item-name">{props.item.name}</span>
      <Show when={props.item.pid != null}>
        <span class="yohu-logs__new-item-pid">{props.item.pid}</span>
      </Show>
    </div>
  );
}

export function NewSessionDialog(props: {
  open: () => boolean;
  onClose: () => void;
  devices: DeviceInfo[];
  focusSerial: string | null;
}) {
  const [mode, setMode] = createSignal<"package" | "pid">("package");
  const [query, setQuery] = createSignal("");
  const [includeChild, setIncludeChild] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");
  const [devices, setDevices] = createSignal<DeviceInfo[]>([]);
  const [deviceSerial, setDeviceSerial] = createSignal<string>("");

  const resetForm = (): void => {
    setMode("package");
    setQuery("");
    setIncludeChild(false);
    setError("");
  };

  const loadDevice = (serial: string): void => {
    setDeviceSerial(serial);
    setError("");
    if (!serial) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const job =
      untrack(mode) === "pid"
        ? logStore.refreshProcesses(serial)
        : logStore.refreshPackages(serial);
    void job.finally(() => setLoading(false));
  };

  createEffect(() => {
    if (!props.open()) return;
    untrack(() => {
      resetForm();
      const online = props.devices.filter((d) => d.state === "online");
      setDevices(online);
      const focus = props.focusSerial ?? logStore.serial() ?? "";
      const next =
        focus && online.some((d) => d.serial === focus) ? focus : (online[0]?.serial ?? "");
      loadDevice(next);
    });
  });

  const switchMode = (next: "package" | "pid"): void => {
    if (mode() === next) return;
    setMode(next);
    setQuery("");
    setError("");
    const serial = deviceSerial();
    if (!serial) return;
    setLoading(true);
    const job = next === "pid" ? logStore.refreshProcesses(serial) : logStore.refreshPackages(serial);
    void job.finally(() => setLoading(false));
  };

  const processEntries = createMemo(
    () => logStore.state.devices[deviceSerial()]?.processEntries ?? [],
  );

  const packageNames = createMemo(() => logStore.state.devices[deviceSerial()]?.packages ?? []);

  const listDegraded = createMemo(() => {
    const slice = logStore.state.devices[deviceSerial()];
    if (!slice) return false;
    return mode() === "pid" ? slice.indexDegraded === true : slice.packagesDegraded === true;
  });

  const pickerItems = createMemo((): PickerItem[] => {
    const q = query().trim().toLowerCase();
    if (mode() === "package") {
      const names = packageNames();
      const filtered = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;
      return filtered.map((name) => ({ key: name, name }));
    }
    const entries = [...processEntries()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
    );
    const filtered = q
      ? entries.filter((e) => e.name.toLowerCase().includes(q) || String(e.pid).includes(q))
      : entries;
    return filtered.map((e) => ({ key: String(e.pid), name: e.name, pid: e.pid }));
  });

  const deviceOptions = createMemo(() =>
    devices().map((device) => ({
      value: device.serial,
      label: devicePickerLabel(device),
    })),
  );

  const selectedKey = (): string | null => {
    const q = query().trim();
    if (!q) return null;
    return pickerItems().some((item) => item.key === q) ? q : null;
  };

  const parsedPid = (): number => Number.parseInt(query().trim(), 10);

  const canCreate = (): boolean => {
    if (!deviceSerial()) return false;
    if (mode() === "package") return query().trim().length > 0;
    const pid = parsedPid();
    return Number.isInteger(pid) && pid > 0;
  };

  const create = (): void => {
    const serial = deviceSerial();
    if (!serial) {
      setError("请选择设备");
      return;
    }
    let scope: SessionScope;
    let title: string;
    if (mode() === "package") {
      const name = query().trim();
      if (!name) {
        setError("请选择或输入包名");
        return;
      }
      scope = { kind: "package", pkg: name, includeChild: includeChild() };
      title = name;
    } else {
      const pid = parsedPid();
      if (!Number.isInteger(pid) || pid <= 0) {
        setError("请输入有效 PID");
        return;
      }
      scope = { kind: "pid", pid };
      title = `PID ${pid}`;
    }
    logStore.createSession(scope, title, serial);
    props.onClose();
  };

  const pickItem = (item: PickerItem): void => {
    setQuery(item.key);
    setError("");
  };

  const emptyHint = (): string => {
    if (mode() === "package") {
      if (loading()) return "正在读取已安装应用…";
      if (query().trim()) return "无匹配应用，将使用上方输入创建";
      return "应用列表为空，可手动输入包名";
    }
    if (loading()) return "正在读取进程…";
    if (query().trim()) return "无匹配进程，将使用上方 PID 创建";
    return "进程列表为空，可手动输入 PID";
  };

  return (
    <YoDialog
      open={props.open}
      title="新建日志窗口"
      height={NEW_SESSION_DIALOG_HEIGHT}
      bodyOverflow="hidden"
      onClose={props.onClose}
      footer={
        <>
          <YoButton variant="ghost" tone="accent" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={create} disabled={!canCreate()}>
            创建
          </YoButton>
        </>
      }
    >
      <div class="yohu-logs__new">
        <YoFormRow
          title="设备"
          description={devices().length === 0 ? "没有在线设备，请先在左侧设备栏连接。" : undefined}
        >
          <Show when={devices().length > 0}>
            <YoSelect
              options={deviceOptions()}
              value={deviceSerial()}
              placeholder="选择设备"
              onChange={loadDevice}
            />
          </Show>
        </YoFormRow>

        <div class="yohu-logs__new-seg">
          <YoSegmentedButton
            block
            ariaLabel="划分方式"
            value={mode()}
            items={[
              { value: "package", label: "包名" },
              { value: "pid", label: "PID" },
            ]}
            onChange={(value) => {
              if (value === "package" || value === "pid") switchMode(value);
            }}
          />
        </div>

        <div class="yohu-logs__new-search">
          <YoTextField
            block
            prefix="search"
            ariaLabel={mode() === "package" ? "过滤或输入包名" : "过滤进程或输入 PID"}
            value={query()}
            clearable
            placeholder={
              mode() === "package"
                ? loading()
                  ? "正在读取已安装应用…"
                  : "过滤或输入包名"
                : loading()
                  ? "正在读取进程…"
                  : "过滤进程或输入 PID"
            }
            onInput={(v) => {
              setQuery(v);
              setError("");
            }}
          />
        </div>

        <div class="yohu-logs__new-list">
          <YoCorner role="control" class="yohu-logs__new-list-chrome">
            <YoIndicator follow={query().trim() || undefined} variant="fill" />
            <Show
              when={pickerItems().length > 0}
              fallback={<p class="yohu-logs__new-empty">{emptyHint()}</p>}
            >
              <NewSessionActivate.Provider
                value={(item) => {
                  pickItem(item);
                  create();
                }}
              >
                <YoVirtualList<PickerItem>
                  items={pickerItems}
                  itemHeight={controlRowHeight()}
                  tone="list"
                  getItemKey={(item) => item.key}
                  selectedKey={selectedKey}
                  onSelectRow={(item) => pickItem(item)}
                  ariaLabel={mode() === "package" ? "包名列表" : "进程列表"}
                  renderRow={NewSessionRow}
                />
              </NewSessionActivate.Provider>
            </Show>
          </YoCorner>
        </div>

        <Show when={mode() === "package"}>
          <YoCheckbox label="包含子进程（pkg:xxx）" checked={includeChild()} onChange={setIncludeChild} />
        </Show>
        <Show when={listDegraded()}>
          <p class="yohu-logs__new-hint">
            {mode() === "package"
              ? "已安装应用列表读取失败，可直接在上方输入包名。"
              : "进程列表读取失败，可直接在上方输入 PID。"}
          </p>
        </Show>
        <Show when={error()}>
          <p class="yohu-logs__new-error">{error()}</p>
        </Show>
      </div>
    </YoDialog>
  );
}
