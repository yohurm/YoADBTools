/**
 * 日志分析页壳：设备绑定、页眉、Tab、列表框、导出与对话框。
 * 清单走 editor/{format,document,view}；过滤条 / 复制手势 / 复制编舞 / 导出动作 / 视口测量分文件。
 */

import { Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack } from "solid-js";

import type { DeviceSession, LogDisplayColumns } from "@yohu/api";
import {
  boundSerial,
  DEVICE_UNSELECTED,
  errorText,
  isCancelledError,
  logLineWraps,
  ModuleTitle,
  tagFilterActive,
} from "@yohu/api";
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
  documentIsHidden,
  openContextMenu,
  type YoSearchControl,
} from "@yohu/ui";

import { copyHasPayload, LOG_COPY_ALL, LOG_COPY_NONE, type LogCopyScope } from "./copy";
import { attachLogCopyGestures } from "./copy-gesture";
import { createCopyController } from "./copy-controller";
import {
  DEFAULT_LOG_DISPLAY_COLUMNS,
  EditorView,
  TAG_DEFAULT_WIDTH_PX,
  appNamesRevision,
  logDocTrackTemplate,
  type EditorViewHandle,
  type FormatOptions,
  type LogDocument,
  type LogMetaColKey,
} from "./editor";
import { createExportAction } from "./export-action";
import { effectiveFollowing } from "./panel";
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
import { dataRowHeight } from "./layout";
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
import { EXPORT_NEEDS_CAPTURE, logStore } from "./store";
import { useLogViewLayout } from "./use-log-view-layout";
import type { LogSessionState } from "./log-model";
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
  const [listEl, setListEl] = createSignal<HTMLDivElement | null>(null);
  // 列宽与表头横滑是会话级 store 字段（单源 LogSessionState.colChars / headShift）：
  // 随会话 id 建/销、切 Tab 各自恢复；关闭会话随会话删除，组件不再持 map、不再手工修剪。
  const [draftColChars, setDraftColChars] = createSignal<Partial<Record<LogMetaColKey, number>>>({});

  const { chPx, rowChars } = useLogViewLayout({
    listEl,
    settings: () => props.settings,
  });

  let keywordRef: YoSearchControl | undefined;
  let activeDoc: LogDocument | null = null;
  let viewHandle: EditorViewHandle | null | undefined;

  const sessionById = (id: number | null) => logStore.sessionById(id);

  const EMPTY_COL_CHARS: Partial<Record<LogMetaColKey, number>> = {};
  const committedCols = (id: number | null): Partial<Record<LogMetaColKey, number>> => {
    const cols = id !== null ? sessionById(id)?.colChars : undefined;
    return (cols as Partial<Record<LogMetaColKey, number>> | undefined) ?? EMPTY_COL_CHARS;
  };
  const headShiftOf = (id: number | null): number => (id !== null ? sessionById(id)?.headShift : 0) ?? 0;
  const writeColumns = (
    id: number,
    patch: { colChars?: Partial<Record<LogMetaColKey, number>>; headShift?: number },
  ): void => {
    const view: { colChars?: Record<string, number>; headShift?: number } = {};
    if (patch.colChars !== undefined) view.colChars = patch.colChars as Record<string, number>;
    if (patch.headShift !== undefined) view.headShift = patch.headShift;
    logStore.setColumnView(id, view);
  };

  // 切会话清拖动草稿；wrap 布局下表头横滑归零。
  createEffect(() => {
    logStore.state.activeSessionId;
    setDraftColChars({});
  });
  createEffect(() => {
    const id = logStore.state.activeSessionId;
    if (id !== null && logLineWraps(props.settings.log_line_layout) && headShiftOf(id) !== 0) {
      writeColumns(id, { headShift: 0 });
    }
  });

  createEffect(() => {
    const serial = boundSerial(props.selectedSerials);
    void logStore.bindSerial(serial);
    untrack(() => logStore.ensureSession());
  });

  createEffect(() => {
    void logStore.state.activeSessionId;
    setContextLine(null);
    setPick(LOG_COPY_NONE);
    closeContextMenu();
  });

  const active = createMemo(() => sessionById(logStore.state.activeSessionId) ?? null);

  const tabs = createMemo(() =>
    logStore.state.sessions.map((s) => ({
      id: String(s.id),
      title: tabTitle(s),
      dot: sessionTabDot(sessionCapturePhase(s)),
    })),
  );

  const capturePhase = (): ReturnType<typeof sessionCapturePhase> =>
    sessionCapturePhase(active() ?? { capturing: false, starting: false });

  const overflowed = createMemo(() => logStore.deviceOf(active()?.serial).overflowed);

  /** 命令目标设备：唯一回落链在 store（显式 serial → 窗口绑定 → 焦点）。 */
  const windowSerial = (): string | null => logStore.commandSerialOf(logStore.state.activeSessionId);

  const windowHasSerial = (): boolean => windowSerial() !== null;

  const showErrorText = (e: unknown): void => {
    toaster.show(errorText(e), "error");
  };

  const showFailure = (failure: string): void => {
    toaster.show(failure, "error");
  };

  const showSuccess = (message: string): void => {
    toaster.show(message, "success");
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
    const appNames = logStore.appNamesOf(serial);
    return {
      display: displayColumns(),
      tagWidthPx: TAG_DEFAULT_WIDTH_PX,
      timeFormat: props.settings.log_time_format,
      layout: props.settings.log_line_layout,
      scheme: props.settings.log_color_scheme,
      appNames,
      appNamesKey: appNamesRevision(appNames),
      colChars: committedCols(logStore.state.activeSessionId),
    };
  });

  /** 表头轨道与列格用「已提交 + 拖动草稿」合成，拖动时只动表头不动文档。 */
  const headerOpts = createMemo((): FormatOptions => ({
    ...formatOpts(),
    colChars: { ...committedCols(logStore.state.activeSessionId), ...draftColChars() },
  }));

  const togglePause = (): void => {
    const id = logStore.state.activeSessionId;
    if (id === null) return;
    const session = sessionById(id);
    if (session && sessionCaptureIsLive(session)) logStore.setPaused(id, !session.paused);
  };

  const copy = createCopyController({
    activeMessages: () => activeDoc?.messages ?? [],
    listEl,
    pick,
    contextLine,
    showFailure,
  });

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
      viewHandle?.selectAll();
      return;
    }
    if (logsKeyIsCopy(action)) return copy.copySelected();
  };

  /** 页面重新可见/聚焦：把在采窗口追到尾部（IPC 层不再监听 DOM 生命周期）。 */
  const onVisible = (): void => {
    if (documentIsHidden()) return;
    logStore.resumeVisible();
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
      copyText: () => copy.copyText(),
    });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    onCleanup(() => {
      stopKeys();
      stopCopy();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      closeContextMenu();
    });
  });

  const showExportNeedsCapture = (): void => {
    toaster.show(EXPORT_NEEDS_CAPTURE, "info");
  };

  const exportAction = createExportAction({
    settings: () => props.settings,
    exportDefaultDir: () => props.exportDefaultDir,
    active,
    exportSession: (id: number, dest?: string) => logStore.exportSession(id, dest),
    showFailure,
    showErrorText,
    showExportNeedsCapture,
    showSuccess,
  });

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
        <YoButton buttonStyle="normal" tone="neutral" onClick={() => void exportAction.doExport()}>
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
            const live = () => sessionById(session.id) ?? session;
            const phase = (): ReturnType<typeof sessionCapturePhase> => sessionCapturePhase(live());
            return (
            <YoPanel variant="pane" overflow="hidden">
              <LogFilterBar
                session={live()}
                keywordRef={(el) => {
                  keywordRef = el;
                }}
              />

              <div class="yohu-logs__list">
                <YoColFrame
                  cellPad="none"
                  tone="document"
                  template={logDocTrackTemplate(headerOpts(), chPx())}
                >
                  <LogColumnHeader
                    options={headerOpts()}
                    chPx={chPx()}
                    shift={headShiftOf(session.id)}
                    onResize={(key, chars, resizePhase) => {
                      if (resizePhase === "end") {
                        setDraftColChars((draft) => {
                          const next = { ...draft };
                          delete next[key];
                          return next;
                        });
                        writeColumns(session.id, {
                          colChars: { ...committedCols(session.id), [key]: chars },
                        });
                      } else {
                        setDraftColChars((draft) => ({ ...draft, [key]: chars }));
                      }
                    }}
                    onFit={(key) => {
                      setDraftColChars((draft) => {
                        const next = { ...draft };
                        delete next[key];
                        return next;
                      });
                      const next = { ...committedCols(session.id) };
                      delete next[key];
                      writeColumns(session.id, { colChars: next });
                    }}
                  />
                  <div
                    class="yohu-logs__list-body"
                    ref={(el) => { setListEl(el); }}
                  >
                  <EditorView
                    rows={() => live().visible}
                    options={formatOpts}
                    layout={() => props.settings.log_line_layout}
                    rowChars={rowChars}
                    chPx={chPx}
                    itemHeight={dataRowHeight()}
                    onInlineScroll={(left) => writeColumns(session.id, { headShift: left })}
                    keyword={() => live().keyword}
                    // 有效跟滚单源在 store（`effectiveFollowing` 已含暂停维度）：
                    // 这里把合成值当 `following` 传，`paused` 恒 false，
                    // 使 editor 侧 `following && !paused` 成为恒等，不再叠第二层布尔。
                    following={() => effectiveFollowing(live().following, live().paused)}
                    paused={() => false}
                    docShift={() => live().docShift}
                    documentRef={(doc) => {
                      activeDoc = doc;
                    }}
                    viewRef={(handle) => {
                      viewHandle = handle;
                    }}
                    onAtBottomChange={(atBottom) => {
                      if (atBottom) {
                        void logStore.loadNewer(session.id);
                        logStore.resumeFollow(session.id);
                      } else {
                        logStore.detachFollow(session.id);
                      }
                    }}
                    onAtTopChange={(atTop) => {
                      if (atTop) void logStore.loadOlder(session.id);
                    }}
                    onRowContextMenu={(row, event) => {
                      setContextLine(row.line);
                      const scope = pick();
                      const canCopy = copyHasPayload({
                        pick: scope,
                        listRoot: listEl(),
                        selection: window.getSelection(),
                        fallbackText: copy.fallbackTextOf(row.line),
                      });
                      openContextMenu(logsRowMenu, {
                        x: event.clientX,
                        y: event.clientY,
                        ctx: {
                          canCopy,
                          copy: () => copy.copySelected(scope, row.line),
                        },
                      });
                    }}
                  />
                  <Show when={live().visible.length === 0}>
                    <SessionEmpty
                      session={live()}
                      canStart={windowHasSerial()}
                      onStart={beginCapture}
                    />
                  </Show>
                </div>
                </YoColFrame>
                <Show when={live().pendingCount > 0}>
                  <div class="yohu-logs__pending">
                    <YoButton buttonStyle="normal" tone="neutral" onClick={() => logStore.resumeFollow(session.id)}>
                      {live().pendingCount} 条新日志
                    </YoButton>
                  </div>
                </Show>
              </div>

              <div class="yohu-logs__status">
                <span class="yohu-logs__status-capture">
                  <YoStatusDot tone={sessionStatusTone(phase())} />
                  {sessionCaptureLabel(phase())}
                </span>
                <span>
                  {formatSessionDevice(live().serial, props.devices, props.deviceStatuses)}
                </span>
                <span>行数 {live().visible.length}</span>
                <YoBadge
                  text={`信号 ${live().signalCount}`}
                  tone={live().signalCount > 0 ? "danger" : "neutral"}
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
