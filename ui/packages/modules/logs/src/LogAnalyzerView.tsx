/**
 * 日志分析页壳：设备绑定、页眉、Tab、列表框、导出与对话框。
 * 清单走 editor/{format,document,view}；过滤条 / 复制手势分文件。
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import type { DeviceSession, LogDisplayColumns } from "@yohu/api";
import { dialogSaveFile, errorText, ipcErrorCode, ModuleTitle, systemOpenPath } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoChrome,
  YoDialog,
  YoEmptyState,
  YoLoading,
  YoPage,
  YoPanel,
  YoScroller,
  YoStatusDot,
  YoTabs,
  YoTextField,
  YoToaster,
  attachPanelKeys,
  closeContextMenu,
  createToaster,
  openContextMenu,
  type YoSearchControl,
} from "@yohu/ui";

import {
  copyHasPayload,
  LOG_COPY_ALL,
  LOG_COPY_NONE,
  serializeLogCopy,
  type LogCopyScope,
} from "./copy";
import { attachLogCopyGestures } from "./copy-gesture";
import {
  DEFAULT_CH_PX,
  DEFAULT_LOG_DISPLAY_COLUMNS,
  EditorView,
  EMPTY_ROWS,
  TAG_DEFAULT_WIDTH_PX,
  type FormatOptions,
  type LogDocument,
} from "./editor";
import { tagFilterActive } from "./filter";
import { suggestedExportPath } from "./host-path";
import { LOGS_KEY_BINDINGS, LOGS_LIST_SELECTOR, type LogsKeyAction } from "./keys";
import { dataRowHeight, measureChPx } from "./layout";
import { LogFilterBar } from "./LogFilterBar";
import { logsRowMenu, logsTabMenu } from "./menu";
import { NewSessionDialog } from "./NewSessionDialog";
import {
  sessionCaptureLabel,
  sessionCapturePhase,
  sessionEmptyWait,
  sessionIsLive,
  sessionTabDot,
} from "./session-chrome";
import { formatSessionDevice, shortSerial } from "./session-device";
import type { ViewRow } from "./stack";
import { deviceSlice, logStore } from "./store";
import type { LogSessionState } from "./workspace";
import "./logs.css";

function errorMessage(e: unknown): string {
  return errorText(e);
}

function isCancelled(e: unknown): boolean {
  return ipcErrorCode(e) === "cancelled";
}

function displayColumnsOf(settings: DeviceSession["settings"]): LogDisplayColumns {
  return {
    ...DEFAULT_LOG_DISPLAY_COLUMNS,
    ...settings.log_display_columns,
  };
}

function tabTitle(session: LogSessionState): string {
  const short = shortSerial(session.serial);
  return short ? `${session.title} · ${short}` : session.title;
}

function SessionEmpty(props: { session: LogSessionState; canStart: boolean; onStart: () => void }) {
  const filterActive = (): boolean =>
    props.session.levels.length > 0 || tagFilterActive(props.session.tagContains) || props.session.keyword.length > 0;
  const phase = (): ReturnType<typeof sessionCapturePhase> => sessionCapturePhase(props.session);
  const idle = (): boolean => phase() === "stopped" && !filterActive();
  return (
    <div class="yohu-logs__empty">
      <Show
        when={!idle()}
        fallback={
          <YoEmptyState
            icon="log"
            title="未采集"
            description="点击「开始采集」拉取设备日志"
            action={
              <YoButton disabled={!props.canStart} onClick={() => props.onStart()}>
                开始采集
              </YoButton>
            }
          />
        }
      >
        <Show
          when={filterActive() && phase() !== "starting"}
          fallback={
            <Show when={sessionEmptyWait(phase())} keyed>
              {(wait) => <YoLoading title={wait.title} description={wait.description} />}
            </Show>
          }
        >
          <YoEmptyState icon="log" title="无匹配日志" description="调整过滤条件（级别/Tag/关键字）后重试" />
        </Show>
      </Show>
    </div>
  );
}

export function LogAnalyzerView(props: DeviceSession) {
  const toaster = createToaster();
  onCleanup(() => toaster.destroy());
  const [newOpen, setNewOpen] = createSignal(false);
  const [contextLine, setContextLine] = createSignal<ViewRow["line"] | null>(null);
  const [renameOpen, setRenameOpen] = createSignal(false);
  const [renameTarget, setRenameTarget] = createSignal<number | null>(null);
  const [renameText, setRenameText] = createSignal("");
  const [pick, setPick] = createSignal<LogCopyScope>(LOG_COPY_NONE);
  const [chPx, setChPx] = createSignal(DEFAULT_CH_PX);
  const [rowChars, setRowChars] = createSignal(0);
  const [listEl, setListEl] = createSignal<HTMLDivElement | null>(null);

  let keywordRef: YoSearchControl | undefined;
  let activeDoc: LogDocument | undefined;

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
      dot: sessionTabDot(sessionCapturePhase(s)),
    })),
  );

  const windowLive = (): boolean => {
    const session = active();
    return Boolean(session && sessionIsLive(session));
  };

  const overflowed = createMemo(() => deviceSlice(logStore.state, active()?.serial).overflowed);

  const windowSerial = (): string | null => active()?.serial ?? props.selectedSerials[0] ?? null;

  const beginCapture = (): void => {
    if (windowSerial() === null) {
      toaster.show("请先选择设备", "info");
      return;
    }
    void logStore.startCapture().catch((e) => {
      if (isCancelled(e)) return;
      toaster.show(errorMessage(e), "error");
    });
  };

  const displayColumns = (): LogDisplayColumns => displayColumnsOf(props.settings);

  const formatOpts = createMemo((): FormatOptions => {
    const serial = active()?.serial ?? windowSerial();
    const names: Record<number, string> = {};
    for (const entry of deviceSlice(logStore.state, serial).processEntries) {
      names[entry.pid] = entry.name;
    }
    return {
      display: displayColumns(),
      tagWidthPx: TAG_DEFAULT_WIDTH_PX,
      timeFormat: props.settings.log_time_format,
      scheme: props.settings.log_color_scheme,
      softWrap: props.settings.log_line_layout === "wrap",
      appNames: names,
    };
  });

  createEffect(() => {
    props.settings.density;
    const host = listEl();
    if (host) {
      setChPx(measureChPx(host));
    }
  });

  createEffect(() => {
    if (props.settings.log_line_layout !== "wrap") {
      setRowChars(0);
      return;
    }
    const host = listEl();
    const px = chPx();
    if (!host) {
      return;
    }
    const apply = (): void => {
      setRowChars(px > 0 ? Math.floor(host.clientWidth / px) : 0);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(host);
    onCleanup(() => ro.disconnect());
  });

  const togglePause = (): void => {
    const id = logStore.state.activeSessionId;
    if (id === null) return;
    const session = logStore.state.sessions.find((s) => s.id === id);
    if (session?.capturing) logStore.setPaused(id, !session.paused);
  };

  const copyMessages = () =>
    (activeDoc?.messages ?? []).map((item) => ({ seq: item.seq, text: item.text }));

  const fallbackTextOf = (line?: ViewRow["line"] | null): string | undefined => {
    const seq = line?.seq;
    if (seq == null) {
      return undefined;
    }
    return copyMessages().find((item) => item.seq === seq)?.text;
  };

  const copyText = (scope: LogCopyScope = pick(), fallbackLine?: ViewRow["line"] | null): string =>
    serializeLogCopy({
      pick: scope,
      messages: copyMessages(),
      listRoot: listEl(),
      selection: typeof window === "undefined" ? null : window.getSelection(),
      fallbackText: fallbackTextOf(fallbackLine ?? contextLine()),
    });

  const copySelected = (scope: LogCopyScope = pick(), fallbackLine?: ViewRow["line"] | null): boolean => {
    const text = copyText(scope, fallbackLine);
    if (!text) return false;
    void navigator.clipboard.writeText(text).catch((e) => toaster.show(`复制失败: ${errorMessage(e)}`, "error"));
    return true;
  };

  const onKeyAction = (action: LogsKeyAction): boolean | void => {
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
    if (action === "copy") return copySelected();
  };

  onMount(() => {
    const stopKeys = attachPanelKeys(window, {
      ownership: "host",
      listSelector: LOGS_LIST_SELECTOR,
      bindings: LOGS_KEY_BINDINGS,
      onAction: onKeyAction,
    });
    const stopCopy = attachLogCopyGestures({
      listRoot: listEl,
      pick,
      setPick,
      copyText: () => copyText(),
    });
    onCleanup(() => {
      stopKeys();
      stopCopy();
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
        const picked = await dialogSaveFile({
          title: "导出日志",
          defaultPath: suggestedExportPath(props.settings.export_default_path),
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
      <YoChrome
        title={ModuleTitle.Logs}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
      >
        <YoButton
          tone={windowLive() ? "danger" : "accent"}
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
            ? sessionCapturePhase(active()!) === "starting"
              ? "取消启动"
              : "停止"
            : "开始"}
        </YoButton>
        <Show when={active()?.capturing}>
          <YoButton
            buttonStyle="normal" tone="neutral"
            onClick={togglePause}
          >
            {active()?.paused ? "继续" : "暂停"}
          </YoButton>
        </Show>
        <YoButton
          buttonStyle="normal" tone="neutral"
          onClick={() => {
            const id = logStore.state.activeSessionId;
            if (id !== null) void logStore.clearVisible(id);
          }}
        >
          清空
        </YoButton>
        <YoButton buttonStyle="normal" tone="neutral" onClick={() => void logStore.clearDevice()} disabled={windowSerial() === null}>
          清设备缓冲
        </YoButton>
        <YoButton buttonStyle="normal" tone="neutral" onClick={() => void doExport()}>
          导出
        </YoButton>
        <Show when={overflowed()}>
          <YoBadge text="缓冲滞后（已回补）" tone="warning" />
        </Show>
      </YoChrome>

      <Show
        when={logStore.state.sessions.length > 0}
        fallback={
          <YoPanel variant="pane" overflow="hidden">
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
                    setRenameOpen(true);
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
            <YoPanel variant="pane" overflow="hidden">
              <LogFilterBar
                session={session}
                keywordRef={(el) => {
                  keywordRef = el;
                }}
              />

              <div class="yohu-logs__list">
                <div
                  class="yohu-logs__list-body"
                  ref={(el) => { setListEl(el); }}
                >
                  <EditorView
                    rows={() =>
                      logStore.state.sessions.find((item) => item.id === session.id)?.visible ?? EMPTY_ROWS
                    }
                    options={formatOpts}
                    layout={() => props.settings.log_line_layout}
                    rowChars={rowChars}
                    chPx={chPx}
                    itemHeight={dataRowHeight()}
                    keyword={() =>
                      logStore.state.sessions.find((item) => item.id === session.id)?.keyword ?? ""
                    }
                    pickAll={() => pick().kind === "all"}
                    following={() =>
                      Boolean(logStore.state.sessions.find((item) => item.id === session.id)?.following)
                    }
                    paused={() =>
                      Boolean(logStore.state.sessions.find((item) => item.id === session.id)?.paused)
                    }
                    documentRef={(doc) => {
                      activeDoc = doc;
                    }}
                    onAtBottomChange={(atBottom) => {
                      const rows =
                        logStore.state.sessions.find((item) => item.id === session.id)?.visible ??
                        EMPTY_ROWS;
                      if (atBottom) logStore.resumeFollow(session.id);
                      else if (rows.length > 0) logStore.detachFollow(session.id);
                    }}
                    onRowContextMenu={(row, event) => {
                      setContextLine(row.line);
                      const scope = pick();
                      const canCopy = copyHasPayload({
                        pick: scope,
                        listRoot: listEl(),
                        selection: window.getSelection(),
                        fallbackText: fallbackTextOf(row.line),
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
                  />
                  <Show
                    when={
                      (logStore.state.sessions.find((s) => s.id === session.id)?.visible.length ?? 0) === 0
                    }
                  >
                    <SessionEmpty
                      session={session}
                      canStart={windowSerial() !== null}
                      onStart={beginCapture}
                    />
                  </Show>
                </div>
                <Show when={session.pendingCount > 0}>
                  <div class="yohu-logs__pending">
                    <YoButton buttonStyle="normal" tone="neutral" onClick={() => logStore.resumeFollow(session.id)}>
                      {session.pendingCount} 条新日志
                    </YoButton>
                  </div>
                </Show>
              </div>

              <div class="yohu-logs__status">
                <span class="yohu-logs__status-capture">
                  <YoStatusDot
                    tone={sessionCapturePhase(session) === "live" ? "success" : "offline"}
                  />
                  {sessionCaptureLabel(sessionCapturePhase(session))}
                </span>
                <span>
                  {formatSessionDevice(session.serial, props.devices, props.deviceStatuses)}
                </span>
                <span>行数 {session.visible.length}</span>
                <YoBadge
                  text={`信号 ${session.signalCount}`}
                  tone={session.signalCount > 0 ? "danger" : "neutral"}
                />
                <Show when={overflowed()}>
                  <YoBadge text="缓冲滞后（已回补）" tone="warning" />
                </Show>
              </div>
            </YoPanel>
          )}
        </Show>
      </Show>

      <NewSessionDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={beginCapture}
        devices={props.devices}
        focusSerial={props.focusSerial}
      />

      <YoDialog
        open={renameOpen}
        title="重命名会话"
        onClose={() => setRenameOpen(false)}
        onExitComplete={() => {
          setRenameTarget(null);
          setRenameText("");
        }}
        footer={
          <>
            <YoButton buttonStyle="normal" tone="accent" onClick={() => setRenameOpen(false)}>
              取消
            </YoButton>
            <YoButton
              onClick={() => {
                const id = renameTarget();
                if (id !== null) logStore.renameSession(id, renameText());
                setRenameOpen(false);
              }}
            >
              确定
            </YoButton>
          </>
        }
      >
        <YoScroller>
          <YoTextField block label="会话标题" value={renameText()} onInput={setRenameText} />
        </YoScroller>
      </YoDialog>

      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
