/**
 * 新建日志窗口：设备 + 划分（包名/PID）。
 * 包名列表来自已安装应用（`log.packageSnapshot`）；PID 列表来自当前进程（`ps`）。
 * 检索框同时是过滤和创建值。清单走 YoVirtualList 默认 document 单选（VL 自持 fill）。
 * 设备与划分同一行：Select block 吃剩余，分段 hug 贴尾。禁止再拆成两行，禁止 FormRow 横排把 Select 收成胶囊。
 * 禁止模块再塞 YoIndicator，禁止 tone=list（不是文件表）。
 * `bodyOverflow=hidden`：清单自管滚轴，禁止再套第二根。不走 bodyLead（确认句居中）。
 */

import { Show, createContext, createEffect, createMemo, createSignal, untrack, useContext } from "solid-js";

import type { DeviceInfo } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoCheckbox,
  YoCorner,
  YoDialog,
  YoEmptyState,
  YoLoading,
  YoSegmentedButton,
  YoSearch,
  YoSelect,
  YoVirtualList,
  searchDocuments,
} from "@yohu/ui";

import type { SessionScope } from "./filter";
import { controlRowHeight, NEW_SESSION_DIALOG_HEIGHT } from "./layout";
import { devicePickerFields } from "./session-device";
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
    const q = query();
    if (mode() === "package") {
      return searchDocuments(
        packageNames().map((name) => ({
          id: name,
          item: { key: name, name },
          fields: [{ key: "name", text: name, weight: 1 }],
        })),
        q,
      ).flatMap((match) => (match.item ? [match.item] : []));
    }
    const entries = [...processEntries()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
    );
    return searchDocuments(
      entries.map((entry) => ({
        id: String(entry.pid),
        item: { key: String(entry.pid), name: entry.name, pid: entry.pid },
        fields: [
          { key: "name", text: entry.name, weight: 2 },
          { key: "pid", text: String(entry.pid), weight: 1 },
        ],
      })),
      q,
    ).flatMap((match) => (match.item ? [match.item] : []));
  });

  const deviceOptions = createMemo(() =>
    devices().map((device) => {
      const fields = devicePickerFields(device);
      return { value: device.serial, ...fields };
    }),
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

  const emptyTitle = (): string => {
    if (query().trim()) return "无匹配";
    return mode() === "package" ? "应用列表为空" : "进程列表为空";
  };

  const emptyDescription = (): string => {
    if (listDegraded()) {
      return mode() === "package"
        ? "已安装应用列表读取失败，可直接在上方输入包名。"
        : "进程列表读取失败，可直接在上方输入 PID。";
    }
    if (query().trim()) {
      return mode() === "package" ? "将使用上方输入创建" : "将使用上方 PID 创建";
    }
    return mode() === "package" ? "可手动输入包名" : "可手动输入 PID";
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
          <YoButton buttonStyle="normal" tone="accent" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={create} disabled={!canCreate()}>
            创建
          </YoButton>
        </>
      }
    >
      <div class="yohu-logs__new">
        <div class="yohu-logs__new-bar">
          <div class="yohu-logs__new-device">
            <Show
              when={devices().length > 0}
              fallback={<span class="yohu-logs__new-device-hint">没有在线设备，请先在左侧设备栏连接。</span>}
            >
              <YoSelect
                block
                options={deviceOptions()}
                value={deviceSerial()}
                placeholder="选择设备"
                onChange={loadDevice}
              />
            </Show>
          </div>
          <div class="yohu-logs__new-seg">
            <YoSegmentedButton
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
        </div>

        <div class="yohu-logs__new-search">
          <YoSearch
            ariaLabel={mode() === "package" ? "过滤或输入包名" : "过滤进程或输入 PID"}
            value={query()}
            status={error() ? "error" : undefined}
            placeholder={mode() === "package" ? "过滤或输入包名" : "过滤进程或输入 PID"}
            onInput={(v) => {
              setQuery(v);
              setError("");
            }}
          />
        </div>

        <div class="yohu-logs__new-list">
          <YoCorner role="control" class="yohu-logs__new-list-chrome" flex="fill" overflow="hidden">
            <Show
              when={!loading()}
              fallback={
                <YoLoading
                  fill
                  title={mode() === "package" ? "正在读取已安装应用…" : "正在读取进程…"}
                />
              }
            >
              <Show
                when={pickerItems().length > 0}
                fallback={<YoEmptyState fill size="sm" title={emptyTitle()} description={emptyDescription()} />}
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
                    getItemKey={(item) => item.key}
                    selectedKey={selectedKey}
                    onSelectRow={(item) => pickItem(item)}
                    ariaLabel={mode() === "package" ? "包名列表" : "进程列表"}
                    renderRow={NewSessionRow}
                  />
                </NewSessionActivate.Provider>
              </Show>
            </Show>
          </YoCorner>
        </div>

        <Show when={mode() === "package"}>
          <YoCheckbox label="包含子进程（pkg:xxx）" checked={includeChild()} onChange={setIncludeChild} />
        </Show>
        <Show when={listDegraded() && pickerItems().length > 0}>
          <YoBadge
            text={mode() === "package" ? "应用列表读取失败，可手动输入" : "进程列表读取失败，可手动输入"}
            tone="warning"
          />
        </Show>
        <Show when={error()}>
          <YoBadge text={error()} tone="danger" />
        </Show>
      </div>
    </YoDialog>
  );
}
