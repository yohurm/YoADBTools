/**
 * 日志分析页壳：设备绑定、页眉、Tab、列表框、导出与对话框。
 * 清单走 editor/{format,document,view}；过滤条 / 复制手势分文件。
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import type { DeviceSession, LogDisplayColumns } from "@yohu/api";
import { writeClipboard, clipboardFailureText, boundSerial, DEVICE_UNSELECTED, dialogFailureText, dialogPickAccepted, dialogSaveFile, errorText, isCancelledError, logLineWraps, ModuleTitle, systemOpenPath, tagFilterActive } from "@yohu/api";
import {
  YoBadge,
  YoButton,
  YoChrome,
  YoColFrame,
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
  logDocTrackTemplate,
  type FormatOptions,
  type LogDocument,
  type LogMetaColKey,
} from "./editor";
import { suggestedExportPath } from "./host-path";
import {
  LOGS_KEY_BINDINGS,
  LOGS_LIST_SELECTOR,
  logsKeyIsClear,
  logsKeyIsCloseTab,
  logsKeyIsCopy,
  logsKeyIsFind,
  logsKeyIsNewTab,
  logsKeyIsNextTab,
  logsKeyIsPause,
  logsKeyIsSelectAll,
  type LogsKeyAction,
} from "./keys";
import { dataRowHeight, measureChPx } from "./layout";
import { LogColumnHeader } from "./LogColumnHeader";
import { LogFilterBar } from "./LogFilterBar";
import {
  logsChromeActions,
  logsChromeIsCapture,
  logsChromeIsClear,
  logsChromeIsClearDevice,
  logsChromeIsExport,
  logsChromeIsPause,
  type LogsChromeAction,
} from "./logs-chrome-actions";
import { logsRowMenu, logsTabMenu } from "./menu";
import { NewSessionDialog } from "./NewSessionDialog";
import {
  sessionCaptureButton,
  sessionCaptureButtonTone,
  sessionCaptureLabel,
  sessionCaptureOccupies,
  sessionCaptureIsLive,
  sessionCapturePhase,
  sessionEmptyView,
  sessionEmptyIsWait,
  sessionStatusTone,
  sessionTabDot,
} from "./session-chrome";
import { formatSessionDevice, shortSerial } from "./session-device";
import type { ViewRow } from "./stack";
import { deviceSlice, logStore } from "./store";
import { EXPORT_NEEDS_CAPTURE, sessionHasCapture, type LogSessionState } from "./workspace";
import "./logs.css";

function overflowLagBadge() {
  return <YoBadge text="缓冲滞后（已回补）" tone="warning" />;
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
  const empty = (): ReturnType<typeof sessionEmptyView> =>
    sessionEmptyView(sessionCapturePhase(props.session), filterActive());
  return (
    <div class="yohu-logs__empty">
      <Show
        when={sessionEmptyIsWait(empty())}
        fallback={
          <YoEmptyState
            icon="log"
            title={empty().title}
            description={empty().description}
            action={
              <Show when={empty().action}>
                {(label) => (
                  <YoButton disabled={!props.canStart} onClick={() => props.onStart()}>
                    {label()}
                  </YoButton>
                )}
              </Show>
            }
          />
        }
      >
        <YoLoading title={empty().title} description={empty().description} />
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
  const [headShift, setHeadShift] = createSignal(0);
  const [colChars, setColChars] = createSignal<Partial<Record<LogMetaColKey, number>>>({});

  let keywordRef: YoSearchControl | undefined;
  let activeDoc: LogDocument | undefined;

  createEffect(() => {
    const serial = boundSerial(props.selectedSerials);
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

  function sessionById(id: number | null) {
    return logStore.state.sessions.find((s) => s.id === id);
  }

  const active = createMemo(() => {
    const id = logStore.state.activeSessionId;
    return sessionById(id) ?? null;
  });

  const tabs = createMemo(() =>
    logStore.state.sessions.map((s) => ({
      id: String(s.id),
      title: tabTitle(s),
      dot: sessionTabDot(sessionCapturePhase(s)),
    })),
  );

  const capturePhase = (): ReturnType<typeof sessionCapturePhase> =>
    sessionCapturePhase(active() ?? { capturing: false, starting: false });

  const overflowed = createMemo(() => deviceSlice(logStore.state, active()?.serial).overflowed);

  const windowSerial = (): string | null => active()?.serial ?? boundSerial(props.selectedSerials);

  const windowHasSerial = (): boolean => windowSerial() !== null;

  const showErrorText = (e: unknown): void => {
    toaster.show(errorText(e), "error");
  };

  const showFailure = (failure: string): void => {
    toaster.show(failure, "error");
  };

  const beginCapture = (): void => {
    if (!windowHasSerial()) {
      toaster.show("请先选择设备", "info");
      return;
    }
    void logStore.startCapture().catch((e) => {
      if (isCancelledError(e)) return;
      showErrorText(e);
    });
  };

  const displayColumns = (): LogDisplayColumns => displayColumnsOf(props.settings);

  const formatOpts = createMemo((): FormatOptions => {
    const serial = windowSerial();
    const names: Record<number, string> = {};
    for (const entry of deviceSlice(logStore.state, serial).processEntries) {
      names[entry.pid] = entry.name;
    }
    return {
      display: displayColumns(),
      tagWidthPx: TAG_DEFAULT_WIDTH_PX,
      timeFormat: props.settings.log_time_format,
      scheme: props.settings.log_color_scheme,
      softWrap: logLineWraps(props.settings.log_line_layout),
      appNames: names,
      colChars: colChars(),
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
    if (logLineWraps(props.settings.log_line_layout)) {
      setHeadShift(0);
    }
  });

  createEffect(() => {
    if (!logLineWraps(props.settings.log_line_layout)) {
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
    const session = sessionById(id);
    if (session && sessionCaptureIsLive(session)) logStore.setPaused(id, !session.paused);
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
    void writeClipboard(text).then((result) => {
      const failure = clipboardFailureText(result);
      if (failure) showFailure(failure);
    });
    return true;
  };

  const openNewSession = (): void => {
    setNewOpen(true);
  };

  const clearActiveVisible = (): void => {
    const id = logStore.state.activeSessionId;
    if (id !== null) void logStore.clearVisible(id);
  };

  const onKeyAction = (action: LogsKeyAction): boolean | void => {
    const id = logStore.state.activeSessionId;
    if (logsKeyIsPause(action)) {
      togglePause();
      return;
    }
    if (logsKeyIsClear(action)) {
      clearActiveVisible();
      return;
    }
    if (logsKeyIsFind(action)) {
      keywordRef?.focus();
      keywordRef?.select();
      return;
    }
    if (logsKeyIsNewTab(action)) {
      openNewSession();
      return;
    }
    if (logsKeyIsCloseTab(action)) {
      if (id !== null) logStore.closeSession(id);
      return;
    }
    if (logsKeyIsNextTab(action)) {
      const ids = logStore.state.sessions.map((s) => s.id);
      if (id !== null) {
        const next = ids[(ids.indexOf(id) + 1) % ids.length];
        if (next !== undefined) logStore.setActive(next);
      }
      return;
    }
    if (logsKeyIsSelectAll(action)) {
      setPick(LOG_COPY_ALL);
      const root = listEl();
      const host = root?.querySelector(".yohu-logs__view") ?? root;
      if (host) window.getSelection()?.selectAllChildren(host);
      return;
    }
    if (logsKeyIsCopy(action)) return copySelected();
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

  const showExportNeedsCapture = (): void => {
    toaster.show(EXPORT_NEEDS_CAPTURE, "info");
  };

  const doExport = async (): Promise<void> => {
    const session = active();
    if (!sessionHasCapture(session)) {
      showExportNeedsCapture();
      return;
    }
    if (props.settings.export_ask_every_time) {
      const picked = await dialogSaveFile({
        title: "导出日志",
        defaultPath: suggestedExportPath(props.settings.export_default_path),
        filters: [{ name: "文本", extensions: ["txt"] }],
      });
      const failure = dialogFailureText(picked);
      if (failure) showFailure(failure);
      if (!dialogPickAccepted(picked)) return;
      await runExport(picked.path);
      return;
    }
    await runExport();
  };

  const runExport = async (dest?: string): Promise<void> => {
    try {
      const path = await logStore.exportSession(dest);
      if (path) {
        toaster.show(`已导出: ${path}`, "success");
        void systemOpenPath(path);
        return;
      }
      showExportNeedsCapture();
    } catch (e) {
      showErrorText(e);
    }
  };

  const chromeActions = createMemo(() => {
    const session = active();
    return logsChromeActions({
      capturing: session ? sessionCaptureIsLive(session) : false,
      overflowed: overflowed(),
    });
  });

  const chromeAction = (id: LogsChromeAction) => {
    if (logsChromeIsCapture(id)) {
      return (
        <YoButton
          tone={sessionCaptureButtonTone(capturePhase())}
          disabled={!sessionCaptureOccupies(capturePhase()) && !windowHasSerial()}
          onClick={() => {
            if (sessionCaptureOccupies(capturePhase())) {
              void logStore.stopCapture().catch(showErrorText);
              return;
            }
            beginCapture();
          }}
        >
          {sessionCaptureButton(capturePhase())}
        </YoButton>
      );
    }
    if (logsChromeIsPause(id)) {
      return (
        <YoButton buttonStyle="normal" tone="neutral" onClick={togglePause}>
          {active()?.paused ? "继续" : "暂停"}
        </YoButton>
      );
    }
    if (logsChromeIsClear(id)) {
      return (
        <YoButton
          buttonStyle="normal"
          tone="neutral"
          onClick={() => clearActiveVisible()}
        >
          清空
        </YoButton>
      );
    }
    if (logsChromeIsClearDevice(id)) {
      return (
        <YoButton
          buttonStyle="normal"
          tone="neutral"
          onClick={() => void logStore.clearDevice()}
          disabled={!windowHasSerial()}
        >
          清设备缓冲
        </YoButton>
      );
    }
    if (logsChromeIsExport(id)) {
      return (
        <YoButton buttonStyle="normal" tone="neutral" onClick={() => void doExport()}>
          导出
        </YoButton>
      );
    }
    return overflowLagBadge();
  };

  return (
    <YoPage class="yohu-logs">
      <YoChrome
        title={ModuleTitle.Logs}
        leading={props.selectedLabel ? <YoBadge text={props.selectedLabel} tone="neutral" /> : undefined}
        actions={chromeActions().map((id) => ({ key: id, node: chromeAction(id) }))}
      />

      <Show
        when={logStore.state.sessions.length > 0}
        fallback={
          <YoPanel variant="pane" overflow="hidden">
            <YoEmptyState icon="log" title={DEVICE_UNSELECTED} description="请在左侧设备栏选择在线设备，或新建日志窗口" />
          </YoPanel>
        }
      >
        <div class="yohu-logs__tabs">
          <YoTabs
            tabs={tabs()}
            activeId={logStore.state.activeSessionId !== null ? String(logStore.state.activeSessionId) : null}
            onActivate={(id) => logStore.setActive(Number(id))}
            onClose={(id) => logStore.closeSession(Number(id))}
            onNew={() => openNewSession()}
            onContextMenu={(id, event) => {
              event.preventDefault();
              const target = Number(id);
              openContextMenu(logsTabMenu, {
                x: event.clientX,
                y: event.clientY,
                ctx: {
                  rename: () => {
                    const session = sessionById(target);
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
          {(session) => {
            const live = () => sessionById(session.id);
            const sessionPhase = sessionCapturePhase(session);
            return (
            <YoPanel variant="pane" overflow="hidden">
              <LogFilterBar
                session={session}
                keywordRef={(el) => {
                  keywordRef = el;
                }}
              />

              <div class="yohu-logs__list">
                <YoColFrame
                  cellPad="none"
                  tone="document"
                  template={logDocTrackTemplate(formatOpts(), chPx())}
                >
                  <LogColumnHeader
                    options={formatOpts()}
                    chPx={chPx()}
                    shift={headShift()}
                    onResize={(key, chars) => setColChars((prev) => ({ ...prev, [key]: chars }))}
                    onFit={(key) =>
                      setColChars((prev) => {
                        const next = { ...prev };
                        delete next[key];
                        return next;
                      })
                    }
                  />
                  <div
                    class="yohu-logs__list-body"
                    ref={(el) => { setListEl(el); }}
                  >
                  <EditorView
                    rows={() =>
                      live()?.visible ?? EMPTY_ROWS
                    }
                    options={formatOpts}
                    layout={() => props.settings.log_line_layout}
                    rowChars={rowChars}
                    chPx={chPx}
                    itemHeight={dataRowHeight()}
                    onInlineScroll={setHeadShift}
                    keyword={() =>
                      live()?.keyword ?? ""
                    }
                    following={() =>
                      Boolean(live()?.following)
                    }
                    paused={() =>
                      Boolean(live()?.paused)
                    }
                    documentRef={(doc) => {
                      activeDoc = doc;
                    }}
                    onAtBottomChange={(atBottom) => {
                      if (atBottom) logStore.resumeFollow(session.id);
                      else logStore.detachFollow(session.id);
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
                      (live()?.visible.length ?? 0) === 0
                    }
                  >
                    <SessionEmpty
                      session={session}
                      canStart={windowHasSerial()}
                      onStart={beginCapture}
                    />
                  </Show>
                </div>
                </YoColFrame>
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
                    tone={sessionStatusTone(sessionPhase)}
                  />
                  {sessionCaptureLabel(sessionPhase)}
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
                  {overflowLagBadge()}
                </Show>
              </div>
            </YoPanel>
            );
          }}
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
        <YoScroller state="on">
          <YoTextField block label="会话标题" value={renameText()} onInput={setRenameText} />
        </YoScroller>
      </YoDialog>

      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
