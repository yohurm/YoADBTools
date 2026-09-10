/**
 * 日志分析主视图：绑定壳注入的 DeviceSession（设备 + 设置）；对话框与本机选路留在视图层。
 * 显示列 / 导出走注入的 DeviceSession.settings。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import type { DeviceSession, LogDisplayColumns } from "@yohu/api";
import { dialogSaveFile, errorText, ModuleTitle, systemOpenPath } from "@yohu/api";
import {
  Icon,
  YoBadge,
  YoButton,
  YoChrome,
  YoColCell,
  YoColFrame,
  YoColHeader,
  YoColRow,
  YoColTrack,
  YoDialog,
  YoEmptyState,
  YoLoading,
  YoPage,
  YoPanel,
  YoSelect,
  YoTabs,
  YoTextField,
  YoToaster,
  YoVirtualList,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  isEditableTarget,
  openContextMenu,
} from "@yohu/ui";

import {
  applyCopyEvent,
  copyHasPayload,
  LOG_COPY_ALL,
  LOG_COPY_NONE,
  serializeLogCopy,
  type LogCopyScope,
} from "./copy";
import { highlightMessage } from "./highlight";
import { LOGS_KEY_BINDINGS, LOGS_LIST_SELECTOR, type LogsKeyAction } from "./keys";
import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  logColTemplate,
  logLineCellText,
  visibleLogColumns,
} from "./layout";
import { logsRowMenu, logsTabMenu } from "./menu";
import { NewSessionDialog } from "./NewSessionDialog";
import { LEVELS, levelKey, type ViewRow } from "./pipeline";
import { formatSessionDevice } from "./session-device";
import { deviceSlice, logStore } from "./store";
import type { LogSessionState } from "./workspace";
import "./logs.css";

const toaster = createToaster();

function errorMessage(e: unknown): string {
  return errorText(e);
}

function isCancelled(e: unknown): boolean {
  if (e && typeof e === "object" && "code" in e && (e as { code: unknown }).code === "cancelled") {
    return true;
  }
  return errorMessage(e).includes("采集已取消");
}

const beginCapture = (): void => {
  void logStore.startCapture().catch((e) => {
    if (isCancelled(e)) return;
    toaster.show(errorMessage(e), "error");
  });
};

const LEVEL_OPTIONS = [
  { value: "", label: "全部" },
  ...LEVELS.map((l) => ({ value: l, label: l })),
];

const rowKey = (row: ViewRow): string => `${row.line.seq}-${row.line.pid}`;

function LogLineCells(props: { row: ViewRow; keyword: string; display: LogDisplayColumns }) {
  const line = (): ViewRow["line"] => props.row.line;
  const raw = (): boolean => line().level === "?";
  return (
    <Show
      when={!raw()}
      fallback={
        <YoColCell class="yohu-logs__row-msg" span>
          {line().msg}
        </YoColCell>
      }
    >
      <For each={visibleLogColumns(props.display)}>
        {(col) => {
          const text = (): string => logLineCellText(line(), col.key);
          if (col.key === "msg") {
            return (
              <YoColCell class="yohu-logs__row-msg" classList={{ "yohu-tone": levelKey(line().level) === "e" }}>
                <Show when={props.keyword} keyed fallback={text()}>
                  {(keyword) => (
                    <For each={highlightMessage(text(), keyword)}>
                      {(chunk) =>
                        typeof chunk === "string" ? chunk : <mark class="yohu-logs__mark yohu-tone">{chunk.mark}</mark>
                      }
                    </For>
                  )}
                </Show>
                <Show when={props.row.collapsedAfter}>
                  <span class="yohu-logs__row-fold" data-log-chrome>
                    …{props.row.collapsedAfter} 帧折叠
                  </span>
                </Show>
              </YoColCell>
            );
          }
          return (
            <YoColCell
              class={`yohu-logs__row-${col.key}`}
              classList={{ "yohu-tone": col.key === "level" || col.key === "tag" }}
              title={col.key === "tag" ? line().tag : undefined}
            >
              {text()}
            </YoColCell>
          );
        }}
      </For>
    </Show>
  );
}

function displayColumnsOf(settings: DeviceSession["settings"]): LogDisplayColumns {
  return {
    ...DEFAULT_LOG_DISPLAY_COLUMNS,
    ...settings.log_display_columns,
  };
}

function sessionPending(session: { starting: boolean }): boolean {
  return session.starting;
}

function shortSerial(serial: string | null): string {
  if (!serial) return "";
  return serial.length > 6 ? serial.slice(-4) : serial;
}

function tabTitle(session: LogSessionState): string {
  const short = shortSerial(session.serial);
  return short ? `${session.title} · ${short}` : session.title;
}

function SessionEmpty(props: { session: LogSessionState }) {
  const filterActive = (): boolean =>
    props.session.minLevel !== null || props.session.tagContains.length > 0 || props.session.keyword.length > 0;
  const idle = (): boolean =>
    !props.session.capturing && !sessionPending(props.session) && !filterActive();
  return (
    <div class="yohu-logs__empty">
      <Show
        when={!idle()}
        fallback={
          <>
            <YoEmptyState icon="log" title="未采集" description="点击「开始采集」拉取设备日志" />
            <YoButton onClick={() => beginCapture()}>开始采集</YoButton>
          </>
        }
      >
        <Show
          when={filterActive() && !sessionPending(props.session)}
          fallback={
            <YoLoading
              title={sessionPending(props.session) ? "正在启动采集…" : "等待设备输出…"}
              description={
                sessionPending(props.session) ? "正在连接设备 logcat" : "logcat 采集中，暂未收到行"
              }
            />
          }
        >
          <YoEmptyState icon="log" title="无匹配日志" description="调整过滤条件（级别/Tag/关键字）后重试" />
        </Show>
      </Show>
    </div>
  );
}

function scopeLabel(session: { scope: { kind: string; pkg?: string; pid?: number } }): string {
  if (session.scope.kind === "package") return `包名: ${session.scope.pkg}`;
  if (session.scope.kind === "pid") return `PID: ${session.scope.pid}`;
  return "System";
}

export function LogAnalyzerView(props: DeviceSession) {
  const [newOpen, setNewOpen] = createSignal(false);
  const [contextLine, setContextLine] = createSignal<ViewRow["line"] | null>(null);
  const [renameTarget, setRenameTarget] = createSignal<number | null>(null);
  const [renameText, setRenameText] = createSignal("");
  const [pick, setPick] = createSignal<LogCopyScope>(LOG_COPY_NONE);

  let keywordRef: HTMLInputElement | undefined;
  let listRoot: HTMLDivElement | undefined;

  createEffect(() => {
    const serial = props.selectedSerials[0] ?? null;
    void logStore.bindSerial(serial);
    untrack(() => logStore.ensureSession());
  });

  createEffect(() => {
    logStore.setBufferCapacity(props.settings.buffer_capacity);
  });

  createEffect(() => {
    void logStore.state.activeSessionId;
    setContextLine(null);
    setPick(LOG_COPY_NONE);
    closeContextMenu();
  });

  const active = createMemo(() => {
    const id = logStore.state.activeSessionId;
    return logStore.state.sessions.find((s) => s.id === id) ?? null;
  });

  const tabs = createMemo(() =>
    logStore.state.sessions.map((s) => ({
      id: String(s.id),
      title: tabTitle(s),
      dot:
        s.signalCount > 0
          ? ({ tone: "error" as const })
          : s.capturing
            ? ({ tone: "success" as const })
            : undefined,
    })),
  );

  const windowLive = (): boolean => {
    const session = active();
    return Boolean(session && (session.capturing || session.starting));
  };

  const overflowed = createMemo(() => deviceSlice(logStore.state, active()?.serial).overflowed);

  const windowSerial = (): string | null => active()?.serial ?? props.selectedSerials[0] ?? null;

  const displayColumns = (): LogDisplayColumns => displayColumnsOf(props.settings);

  const togglePause = (): void => {
    const id = logStore.state.activeSessionId;
    if (id === null) return;
    const session = logStore.state.sessions.find((s) => s.id === id);
    if (session?.capturing) logStore.setPaused(id, !session.paused);
  };

  const visibleRows = (): ViewRow[] =>
    logStore.state.sessions.find((s) => s.id === logStore.state.activeSessionId)?.visible ?? [];

  const copyText = (scope: LogCopyScope = pick(), fallbackLine?: ViewRow["line"] | null): string =>
    serializeLogCopy({
      pick: scope,
      rows: visibleRows(),
      listRoot: listRoot ?? null,
      selection: window.getSelection(),
      fallbackLine: fallbackLine ?? contextLine(),
      display: displayColumns(),
    });

  const copySelected = (scope: LogCopyScope = pick(), fallbackLine?: ViewRow["line"] | null): void => {
    const text = copyText(scope, fallbackLine);
    if (!text) return;
    void navigator.clipboard.writeText(text).catch((e) => toaster.show(`复制失败: ${errorMessage(e)}`, "error"));
  };

  const onKeyAction = (action: LogsKeyAction): void => {
    const id = logStore.state.activeSessionId;
    if (action === "pause") {
      togglePause();
      return;
    }
    if (action === "clear") {
      if (id !== null) void logStore.clearVisible(id);
      return;
    }
    if (action === "find") {
      keywordRef?.focus();
      keywordRef?.select();
      return;
    }
    if (action === "new-tab") {
      setNewOpen(true);
      return;
    }
    if (action === "close-tab") {
      if (id !== null) logStore.closeSession(id);
      return;
    }
    if (action === "next-tab") {
      const ids = logStore.state.sessions.map((s) => s.id);
      if (id !== null) {
        const next = ids[(ids.indexOf(id) + 1) % ids.length];
        if (next !== undefined) logStore.setActive(next);
      }
      return;
    }
    if (action === "select-all") {
      setPick(LOG_COPY_ALL);
      window.getSelection()?.removeAllRanges();
      return;
    }
    if (action === "copy") copySelected();
  };

  onMount(() => {
    const stop = attachPanelKeys(window, {
      ownership: "host",
      listSelector: LOGS_LIST_SELECTOR,
      bindings: LOGS_KEY_BINDINGS,
      onAction: onKeyAction,
    });
    const onSelChange = (): void => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !listRoot || !sel.anchorNode || !listRoot.contains(sel.anchorNode)) {
        return;
      }
      if (pick().kind === "all") {
        setPick(LOG_COPY_NONE);
      }
    };
    const onCopy = (event: ClipboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const target = event.target;
      const inList = Boolean(listRoot && target instanceof Node && listRoot.contains(target));
      if (!inList && pick().kind !== "all") return;
      applyCopyEvent(event, copyText());
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || !listRoot) return;
      const target = event.target;
      if (!(target instanceof Element) || !listRoot.contains(target)) return;
      if (pick().kind === "all") {
        setPick(LOG_COPY_NONE);
      }
    };
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("pointerdown", onPointerDown);
    onCleanup(() => {
      stop();
      document.removeEventListener("selectionchange", onSelChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("pointerdown", onPointerDown);
      closeContextMenu();
    });
  });

  const doExport = async (): Promise<void> => {
    const session = active();
    if (!session?.serial || session.fromSeq < 0) {
      toaster.show("请先选择设备并采集日志", "info");
      return;
    }
    try {
      if (props.settings.export_ask_every_time) {
        const defaultPath = props.settings.export_default_path;
        const picked = await dialogSaveFile({
          title: "导出日志",
          defaultPath: defaultPath ? `${defaultPath}\\logcat-export.txt` : "logcat-export.txt",
          filters: [{ name: "文本", extensions: ["txt"] }],
        });
        if (typeof picked !== "string") return;
        await runExport(picked);
        return;
      }
      await runExport();
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  const runExport = async (dest?: string): Promise<void> => {
    try {
      const path = await logStore.exportSession(dest);
      if (path) {
        toaster.show(`已导出: ${path}`, "success");
        void systemOpenPath(path);
        return;
      }
      toaster.show("请先选择设备并采集日志", "info");
    } catch (e) {
      toaster.show(`导出失败: ${errorMessage(e)}`, "error");
    }
  };

  return (
    <YoPage class="yohu-logs">
      <YoChrome title={ModuleTitle.Logs} deviceLabel={props.selectedLabel ?? undefined}>
        <YoButton
          variant={windowLive() ? "danger" : "primary"}
          disabled={!windowLive() && windowSerial() === null}
          onClick={() => {
            if (windowLive()) {
              void logStore.stopCapture().catch((e) => toaster.show(errorMessage(e), "error"));
              return;
            }
            beginCapture();
          }}
        >
          {windowLive()
            ? active()?.starting && !active()?.capturing
              ? "取消启动"
              : "停止"
            : "开始"}
        </YoButton>
        <Show when={active()?.capturing}>
          <YoButton
            variant="secondary"
            onClick={togglePause}
          >
            {active()?.paused ? "继续" : "暂停"}
          </YoButton>
        </Show>
        <YoButton
          variant="secondary"
          onClick={() => {
            const id = logStore.state.activeSessionId;
            if (id !== null) void logStore.clearVisible(id);
          }}
        >
          清空
        </YoButton>
        <YoButton variant="secondary" onClick={() => void logStore.clearDevice()} disabled={windowSerial() === null}>
          清设备缓冲
        </YoButton>
        <YoButton variant="secondary" onClick={() => void doExport()}>
          导出
        </YoButton>
        <Show when={overflowed()}>
          <YoBadge text="缓冲滞后（已回补）" tone="warn" />
        </Show>
      </YoChrome>

      <Show
        when={logStore.state.sessions.length > 0}
        fallback={
          <YoPanel variant="pane">
            <YoEmptyState icon="log" title="未选择设备" description="请在左侧设备栏选择在线设备，或新建日志窗口" />
          </YoPanel>
        }
      >
        <div class="yohu-logs__tabs">
          <YoTabs
            tabs={tabs()}
            activeId={logStore.state.activeSessionId !== null ? String(logStore.state.activeSessionId) : null}
            onActivate={(id) => logStore.setActive(Number(id))}
            onClose={(id) => logStore.closeSession(Number(id))}
            onNew={() => setNewOpen(true)}
            onContextMenu={(id, event) => {
              event.preventDefault();
              const target = Number(id);
              openContextMenu(logsTabMenu, {
                x: event.clientX,
                y: event.clientY,
                ctx: {
                  rename: () => {
                    const session = logStore.state.sessions.find((s) => s.id === target);
                    setRenameTarget(target);
                    setRenameText(session?.title ?? "");
                  },
                  duplicate: () => {
                    logStore.duplicateSession(target);
                  },
                  closeOthers: () => {
                    logStore.closeOthers(target);
                  },
                },
              });
            }}
          />
        </div>

        <Show when={active()} keyed>
          {(session) => (
            <YoPanel variant="pane">
              <div class="yohu-logs__filter">
                <YoSelect
                  options={LEVEL_OPTIONS}
                  value={session.minLevel ?? ""}
                  onChange={(v) => logStore.patchFilter(session.id, { minLevel: v === "" ? null : v })}
                />
                <YoTextField
                  ariaLabel="Tag"
                  placeholder="Tag"
                  value={session.tagContains}
                  clearable
                  onInput={(v) => logStore.patchFilter(session.id, { tagContains: v })}
                />
                <span
                  class="yohu-logs__search"
                  classList={{ "yohu-logs__search--active": session.keyword.length > 0 }}
                  ref={(el) => {
                    keywordRef = el.querySelector("input") ?? undefined;
                  }}
                >
                  <span class="yohu-logs__search-icon" aria-hidden="true">
                    <Icon name="search" size={13} />
                  </span>
                  <YoTextField
                    ariaLabel="关键字"
                    placeholder="检索消息"
                    value={session.keyword}
                    clearable
                    onInput={(v) => logStore.patchFilter(session.id, { keyword: v })}
                  />
                </span>
                <span class="yohu-logs__scope">
                  <YoBadge text={scopeLabel(session)} tone="accent" />
                </span>
              </div>

              <YoColFrame
                class="yohu-logs__list"
                template={logColTemplate(displayColumns(), logStore.state.colWidths)}
              >
                <YoColRow class="yohu-logs__cols yohu-logs__cols--head">
                  <For each={visibleLogColumns(displayColumns())}>
                    {(col) => (
                      <YoColHeader
                        resizable={!col.flex}
                        resizeLabel={col.resizeLabel}
                        width={logStore.state.colWidths[col.key] ?? col.defaultWidth}
                        minWidth={col.minWidth}
                        onWidthChange={(width) => logStore.setColWidth(col.key, width)}
                      >
                        <span class="yohu-col-header__label">{col.header}</span>
                      </YoColHeader>
                    )}
                  </For>
                </YoColRow>
                <div
                  class="yohu-logs__list-body"
                  ref={(el) => { listRoot = el; }}
                >
                  <Show
                    when={(logStore.state.sessions.find((s) => s.id === session.id)?.visible.length ?? 0) > 0}
                    fallback={<SessionEmpty session={session} />}
                  >
                    <YoVirtualList<ViewRow>
                      items={() => logStore.state.sessions.find((s) => s.id === session.id)?.visible ?? []}
                      getItemKey={rowKey}
                      autoScrollToBottom={() => session.following && !session.paused}
                      onAtBottomChange={(atBottom) => {
                        if (atBottom) logStore.resumeFollow(session.id);
                        else logStore.detachFollow(session.id);
                      }}
                      ariaLabel="日志列表"
                      onRowContextMenu={(row, _key, event) => {
                        setContextLine(row.line);
                        const scope = pick();
                        const selection = window.getSelection();
                        const canCopy = copyHasPayload({
                          pick: scope,
                          selection,
                          fallbackLine: row.line,
                        });
                        openContextMenu(logsRowMenu, {
                          x: event.clientX,
                          y: event.clientY,
                          ctx: {
                            canCopy,
                            copy: () => copySelected(scope, row.line),
                          },
                        });
                      }}
                      renderRow={(row) => (
                        <YoColTrack
                          class="yohu-logs__cols yohu-logs__row"
                          data-seq={String(row.line.seq)}
                          data-level={levelKey(row.line.level) ?? undefined}
                          classList={{
                            "yohu-logs__row--signal": row.signal !== undefined,
                            "yohu-logs__row--raw": row.line.level === "?",
                            "yohu-logs__row--picked": pick().kind === "all",
                          }}
                        >
                          <LogLineCells row={row} keyword={session.keyword} display={displayColumns()} />
                        </YoColTrack>
                      )}
                    />
                  </Show>
                </div>
                <Show when={session.pendingCount > 0}>
                  <div class="yohu-logs__pending">
                    <YoButton variant="secondary" onClick={() => logStore.resumeFollow(session.id)}>
                      {session.pendingCount} 条新日志
                    </YoButton>
                  </div>
                </Show>
              </YoColFrame>

              <div class="yohu-logs__status">
                <span class="yohu-logs__status-capture">
                  <span
                    class="yohu-logs__status-dot"
                    classList={{ "yohu-logs__status-dot--on": session.capturing }}
                  />
                  {session.capturing
                    ? "采集中"
                    : sessionPending(session)
                      ? "启动中"
                      : "已停止"}
                </span>
                <span>
                  {formatSessionDevice(session.serial, props.devices, props.deviceStatuses)}
                </span>
                <span>行数 {session.visible.length}</span>
                <span classList={{ "yohu-logs__status-signal": session.signalCount > 0 }}>
                  信号 {session.signalCount}
                </span>
                <Show when={overflowed()}>
                  <span class="yohu-logs__status-lag">缓冲滞后（已回补）</span>
                </Show>
              </div>
            </YoPanel>
          )}
        </Show>
      </Show>

      <NewSessionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        devices={props.devices}
        focusSerial={props.focusSerial}
      />

      <YoDialog
        open={() => renameTarget() !== null}
        title="重命名会话"
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <YoButton variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </YoButton>
            <YoButton
              onClick={() => {
                const id = renameTarget();
                if (id !== null) logStore.renameSession(id, renameText());
                setRenameTarget(null);
              }}
            >
              确定
            </YoButton>
          </>
        }
      >
        <YoTextField label="会话标题" value={renameText()} onInput={setRenameText} />
      </YoDialog>

      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
