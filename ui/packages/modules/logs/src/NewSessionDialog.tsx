/**
 * 新建日志窗口：设备 + 划分（包名/PID）。
 * 包名列表来自已安装应用（`log.packageSnapshot`）；PID 列表来自当前进程（`ps`）。
 * 检索框同时是过滤和创建值：Enter / 创建 / 双击同一条提交。workspace 只加页签，订阅由 onCreated 走「开始采集」。
 * 设备与划分同一行：Select block 吃剩余，分段 hug 贴尾。禁止再拆成两行，禁止 FormRow 横排把 Select 收成胶囊。
 * 禁止模块再塞 YoIndicator，禁止 tone=list（不是文件表）。
 * `bodyOverflow=hidden`：清单自管滚轴，禁止再套第二根。不走 bodyLead（确认句居中）。
 */

import { Show, createContext, createEffect, createMemo, createSignal, untrack, useContext } from "solid-js";

import { YoLog, deviceIsOnline, type DeviceInfo } from "@yohu/api";
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
  controlRowHeight,
  resolveDialogOpen,
  type YoDialogProps,
  searchDocuments,
  trimmedTextPresent,
} from "@yohu/ui";

import type { SessionScope } from "./filter";
import { NEW_SESSION_DIALOG_HEIGHT } from "./layout";
import {
  newSessionIsPackage,
  newSessionModeOf,
  newSessionPackageName,
  newSessionPid,
  type NewSessionMode,
} from "./new-session-mode";
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

function NewSessionActions(props: {
  canCreate: () => boolean;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <>
      <YoButton buttonStyle="normal" tone="accent" onClick={props.onCancel}>
        取消
      </YoButton>
      <YoButton onClick={() => props.onCreate()} disabled={!props.canCreate()}>
        创建
      </YoButton>
    </>
  );
}

function sliceList<T>(value: readonly T[] | undefined): readonly T[] { return value ?? []; }

export function NewSessionDialog(props: {
  open: YoDialogProps["open"];
  onClose: () => void;
  onCreated?: () => void;
  devices: DeviceInfo[];
  focusSerial: string | null;
}) {
  const [mode, setMode] = createSignal<NewSessionMode>("package");
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

  const watchLoad = (begin: () => Promise<unknown>): void => {
    setLoading(true);
    const job = begin();
    void job.finally(() => setLoading(false));
  };

  const loadDevice = (serial: string): void => {
    setDeviceSerial(serial);
    setError("");
    if (!serial) {
      setLoading(false);
      return;
    }
    watchLoad(() =>
      !newSessionIsPackage(untrack(mode))
        ? logStore.refreshProcesses(serial)
        : logStore.refreshPackages(serial),
    );
  };

  createEffect(() => {
    if (!resolveDialogOpen(props.open)) return;
    untrack(() => {
      resetForm();
      const online = props.devices.filter((d) => deviceIsOnline(d.state));
      setDevices(online);
      const focus = props.focusSerial ?? logStore.serial() ?? "";
      const next =
        focus && online.some((d) => d.serial === focus) ? focus : (online[0]?.serial ?? "");
      loadDevice(next);
    });
  });

  const switchMode = (next: NewSessionMode): void => {
    if (mode() === next) return;
    setMode(next);
    setQuery("");
    setError("");
    const serial = deviceSerial();
    if (!serial) return;
    watchLoad(() =>
      newSessionIsPackage(next) ? logStore.refreshPackages(serial) : logStore.refreshProcesses(serial),
    );
  };

  const deviceSlice = () => logStore.state.devices[deviceSerial()];

  const processEntries = createMemo(
    () => sliceList(deviceSlice()?.processEntries),
  );

  const packageNames = createMemo(() => sliceList(deviceSlice()?.packages));

  const listDegraded = createMemo(() => {
    const slice = deviceSlice();
    if (!slice) return false;
    return newSessionIsPackage(mode()) ? slice.packagesDegraded === true : slice.indexDegraded === true;
  });

  function searchHitItems<T>(matches: readonly { item?: T }[]): T[] {
    return matches.flatMap((match) => (match.item ? [match.item] : []));
  }

  const pickerItems = createMemo((): PickerItem[] => {
    const q = query();
    if (newSessionIsPackage(mode())) {
      return searchHitItems(searchDocuments(
        packageNames().map((name) => ({
          id: name,
          item: { key: name, name },
          fields: [{ key: "name", text: name, weight: 1 }],
        })),
        q,
      ));
    }
    const entries = [...processEntries()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.pid - b.pid,
    );
    return searchHitItems(searchDocuments(
      entries.map((entry) => ({
        id: String(entry.pid),
        item: { key: String(entry.pid), name: entry.name, pid: entry.pid },
        fields: [
          { key: "name", text: entry.name, weight: 2 },
          { key: "pid", text: String(entry.pid), weight: 1 },
        ],
      })),
      q,
    ));
  });

  const deviceOptions = createMemo(() =>
    devices().map((device) => {
      const fields = devicePickerFields(device);
      return { value: device.serial, ...fields };
    }),
  );

  const selectedKey = (): string | null => {
    const q = query().trim();
    if (!trimmedTextPresent(q)) return null;
    return pickerItems().some((item) => item.key === q) ? q : null;
  };

  const canCreate = (): boolean => {
    if (!deviceSerial()) return false;
    if (newSessionIsPackage(mode())) return newSessionPackageName(query()) !== null;
    return newSessionPid(query()) !== null;
  };

  const create = (): void => {
    const serial = deviceSerial();
    if (!serial) {
      setError("请选择设备");
      return;
    }
    let scope: SessionScope;
    let title: string;
    if (newSessionIsPackage(mode())) {
      const name = newSessionPackageName(query());
      if (name === null) {
        setError("请选择或输入包名");
        return;
      }
      scope = { kind: "package", pkg: name, includeChild: includeChild() };
      title = name;
    } else {
      const pid = newSessionPid(query());
      if (pid === null) {
        setError("请输入有效 PID");
        return;
      }
      scope = { kind: "pid", pid };
      title = `PID ${pid}`;
    }
    const id = logStore.createSession(scope, title, serial);
    YoLog.info("logs", "新建窗口", { id, serial, kind: scope.kind, title });
    props.onClose();
    props.onCreated?.();
  };

  const pickItem = (item: PickerItem): void => {
    setQuery(item.key);
    setError("");
  };

  const emptyTitle = (): string => {
    if (trimmedTextPresent(query())) return "无匹配";
    return newSessionIsPackage(mode()) ? "应用列表为空" : "进程列表为空";
  };

  const emptyDescription = (): string => {
    if (listDegraded()) {
      return newSessionIsPackage(mode())
        ? "已安装应用列表读取失败，可直接在上方输入包名。"
        : "进程列表读取失败，可直接在上方输入 PID。";
    }
    if (trimmedTextPresent(query())) {
      return newSessionIsPackage(mode()) ? "将使用上方输入创建" : "将使用上方 PID 创建";
    }
    return newSessionIsPackage(mode()) ? "可手动输入包名" : "可手动输入 PID";
  };

  const filterPrompt = (): string =>
    newSessionIsPackage(mode()) ? "过滤或输入包名" : "过滤进程或输入 PID";

  return (
    <YoDialog
      open={props.open}
      title="新建日志窗口"
      height={NEW_SESSION_DIALOG_HEIGHT}
      bodyOverflow="hidden"
      onClose={props.onClose}
      footer={
        <NewSessionActions canCreate={canCreate} onCancel={props.onClose} onCreate={create} />
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
                const next = newSessionModeOf(value);
                if (next) switchMode(next);
              }}
            />
          </div>
        </div>

        <div class="yohu-logs__new-search">
          <YoSearch
            ariaLabel={filterPrompt()}
            value={query()}
            status={error() ? "error" : undefined}
            placeholder={filterPrompt()}
            onInput={(v) => {
              setQuery(v);
              setError("");
            }}
            onSubmit={() => create()}
          />
        </div>

        <div class="yohu-logs__new-list">
          <YoCorner role="control" flex="fill" overflow="hidden">
            <Show
              when={!loading()}
              fallback={
                <YoLoading
                  fill
                  title={newSessionIsPackage(mode()) ? "正在读取已安装应用…" : "正在读取进程…"}
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
                    ariaLabel={newSessionIsPackage(mode()) ? "包名列表" : "进程列表"}
                    renderRow={NewSessionRow}
                  />
                </NewSessionActivate.Provider>
              </Show>
            </Show>
          </YoCorner>
        </div>

        <Show when={newSessionIsPackage(mode())}>
          <YoCheckbox label="包含子进程（pkg:xxx）" checked={includeChild()} onChange={setIncludeChild} />
        </Show>
        <Show when={listDegraded() && pickerItems().length > 0}>
          <YoBadge
            text={newSessionIsPackage(mode()) ? "应用列表读取失败，可手动输入" : "进程列表读取失败，可手动输入"}
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
