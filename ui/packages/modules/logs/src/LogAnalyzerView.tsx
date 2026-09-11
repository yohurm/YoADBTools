/**
 * 日志分析主视图：绑定壳注入的 DeviceSession（设备 + 设置）；对话框与本机选路留在视图层。
 * 显示列 / 导出走注入的 DeviceSession.settings。
 * 行是 formatLogDoc 文档；表头铬层可拖宽。选区走原生 Selection。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, untrack, type Accessor, type JSX } from "solid-js";

import type { DeviceSession, LogDisplayColumns } from "@yohu/api";
import { dialogSaveFile, errorText, ModuleTitle, systemOpenPath } from "@yohu/api";
import {
  Icon,
  YoBadge,
  YoButton,
  YoChrome,
  YoColFrame,
  YoColHeader,
  YoColRow,
  YoDialog,
  YoEmptyState,
  YoLoading,
  YoPage,
  YoPanel,
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
  logSelectionInList,
  serializeLogCopy,
  type LogCopyScope,
} from "./copy";
import {
  DEFAULT_CH_PX,
  formatLogDocParts,
  joinLogDoc,
  logDocTrackTemplate,
  measureChPx,
  splitLevelGlyph,
  type LogDocLayout,
} from "./doc";
import { highlightMessage } from "./highlight";
import { LOGS_KEY_BINDINGS, LOGS_LIST_SELECTOR, type LogsKeyAction } from "./keys";
import { DEFAULT_LOG_DISPLAY_COLUMNS, tsFieldPx, visibleLogColumns } from "./layout";
import { logsRowMenu, logsTabMenu } from "./menu";
import { NewSessionDialog } from "./NewSessionDialog";
import { LEVELS, levelInkStyle, levelKey, levelLabel, levelPaint, toggleLevel, type ViewRow } from "./pipeline";
import {
  sessionCaptureLabel,
  sessionCapturePhase,
  sessionEmptyWait,
  sessionIsLive,
  sessionTabDot,
} from "./session-chrome";
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

const rowKey = (row: ViewRow): string => `${row.line.seq}-${row.line.pid}`;

function LogLineDoc(props: { row: ViewRow; keyword: string; layout: Accessor<LogDocLayout> }) {
  const line = (): ViewRow["line"] => props.row.line;
  const parts = createMemo(
    () => formatLogDocParts(line(), props.layout()),
    [],
    { equals: (prev, next) => joinLogDoc(prev) === joinLogDoc(next) },
  );
  return (
    <>
      <For each={parts()}>
        {(part) => {
          if (part.kind === "level") {
            const glyph = splitLevelGlyph(part.text);
            return (
              <>
                {glyph.lead}
                <span class="yohu-logs__row-level yohu-tone">{glyph.letter}</span>
                {glyph.pad}
              </>
            );
          }
          if (part.kind === "msg") {
            const key = levelKey(line().level);
            return (
              <span
                class="yohu-logs__row-msg"
                classList={{ "yohu-tone": key ? levelPaint(key).tintMessage : false }}
              >
                <Show when={props.keyword} keyed fallback={part.text}>
                  {(keyword) => (
                    <For each={highlightMessage(part.text, keyword)}>
                      {(chunk) =>
                        typeof chunk === "string" ? chunk : <mark class="yohu-logs__mark yohu-tone">{chunk.mark}</mark>
                      }
                    </For>
                  )}
                </Show>
              </span>
            );
          }
          const cell = (
            <span
              class={`yohu-logs__row-${part.kind}`}
              classList={{ "yohu-tone": part.kind === "tag" }}
            >
              {part.text}
            </span>
          );
          return cell;
        }}
      </For>
      <Show when={props.row.collapsedAfter}>
        <span class="yohu-logs__row-fold" data-log-chrome>
          …{props.row.collapsedAfter} 帧折叠
        </span>
      </Show>
    </>
  );
}

function displayColumnsOf(settings: DeviceSession["settings"]): LogDisplayColumns {
  return {
    ...DEFAULT_LOG_DISPLAY_COLUMNS,
    ...settings.log_display_columns,
  };
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
    props.session.levels.length > 0 || props.session.tagContains.length > 0 || props.session.keyword.length > 0;
  const phase = (): ReturnType<typeof sessionCapturePhase> => sessionCapturePhase(props.session);
  const idle = (): boolean => phase() === "stopped" && !filterActive();
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
  const [chPx, setChPx] = createSignal(DEFAULT_CH_PX);
  const [listEl, setListEl] = createSignal<HTMLDivElement | null>(null);

  let keywordRef: HTMLInputElement | undefined;

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

  const displayColumns = (): LogDisplayColumns => displayColumnsOf(props.settings);

  const docLayout = createMemo((): LogDocLayout => {
    const widths = logStore.state.colWidths;
    return {
      display: displayColumns(),
      widths: {
        ts: widths.ts,
        uid: widths.uid,
        pid: widths.pid,
        tid: widths.tid,
        level: widths.level,
        tag: widths.tag,
        msg: widths.msg,
      },
      chPx: chPx(),
      timeFormat: props.settings.log_time_format,
    };
  });

  createEffect(() => {
    const format = props.settings.log_time_format;
    logStore.setColWidth("ts", tsFieldPx(format));
  });

  createEffect(() => {
    props.settings.density;
    const host = listEl();
    if (host) {
      setChPx(measureChPx(host));
    }
  });

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
      listRoot: listEl(),
      selection: typeof window === "undefined" ? null : window.getSelection(),
      fallbackLine: fallbackLine ?? contextLine(),
      layout: docLayout(),
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
    const onCopy = (event: ClipboardEvent): void => {
      if (isEditableTarget(event.target)) return;
      const root = listEl();
      const selection = window.getSelection();
      const inList = Boolean(
        root &&
          ((event.target instanceof Node && root.contains(event.target)) || logSelectionInList(root, selection)),
      );
      if (!inList && pick().kind !== "all") return;
      applyCopyEvent(event, copyText());
    };
    const onPointerDown = (event: PointerEvent): void => {
      const root = listEl();
      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return;
      if (event.button !== 0) return;
      if (pick().kind !== "none") setPick(LOG_COPY_NONE);
      const id = logStore.state.activeSessionId;
      const rows = visibleRows();
      if (id !== null && rows.length > 0) logStore.detachFollow(id);
    };
    const onSelectionChange = (): void => {
      if (logSelectionInList(listEl(), window.getSelection())) {
        setPick(LOG_COPY_NONE);
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("selectionchange", onSelectionChange);
    onCleanup(() => {
      stop();
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("selectionchange", onSelectionChange);
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
            variant="outlined" tone="neutral"
            onClick={togglePause}
          >
            {active()?.paused ? "继续" : "暂停"}
          </YoButton>
        </Show>
        <YoButton
          variant="outlined" tone="neutral"
          onClick={() => {
            const id = logStore.state.activeSessionId;
            if (id !== null) void logStore.clearVisible(id);
          }}
        >
          清空
        </YoButton>
        <YoButton variant="outlined" tone="neutral" onClick={() => void logStore.clearDevice()} disabled={windowSerial() === null}>
          清设备缓冲
        </YoButton>
        <YoButton variant="outlined" tone="neutral" onClick={() => void doExport()}>
          导出
        </YoButton>
        <Show when={overflowed()}>
          <YoBadge text="缓冲滞后（已回补）" tone="warning" />
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
                <div class="yohu-logs__levels" role="group" aria-label="级别">
                  <For each={LEVELS}>
                    {(letter) => {
                      const pressed = (): boolean => session.levels.includes(letter);
                      const key = levelKey(letter);
                      return (
                        <span
                          class="yohu-logs__level-slot yohu-tone"
                          data-level={key ?? undefined}
                          style={key ? (levelInkStyle(key) as JSX.CSSProperties) : undefined}
                        >
                          <YoButton
                            variant="ghost"
                            tone="neutral"
                            size="md"
                            ink
                            flush
                            aria-label={levelLabel(letter)}
                            aria-pressed={pressed()}
                            onClick={() =>
                              logStore.patchFilter(session.id, {
                                levels: toggleLevel(session.levels, letter),
                              })
                            }
                          >
                            {letter}
                          </YoButton>
                        </span>
                      );
                    }}
                  </For>
                </div>
                <span class="yohu-logs__field">
                  <YoTextField
                    block
                    ariaLabel="Tag"
                    placeholder="Tag"
                    value={session.tagContains}
                    clearable
                    onInput={(v) => logStore.patchFilter(session.id, { tagContains: v })}
                  />
                </span>
                <span class="yohu-logs__search yohu-logs__field">
                  <YoTextField
                    block
                    prefix="search"
                    ariaLabel="关键字"
                    placeholder="检索消息"
                    value={session.keyword}
                    clearable
                    active={session.keyword.length > 0}
                    inputRef={(el) => {
                      keywordRef = el;
                    }}
                    onInput={(v) => logStore.patchFilter(session.id, { keyword: v })}
                  />
                </span>
                <span class="yohu-logs__scope">
                  <YoBadge text={scopeLabel(session)} tone="accent" />
                </span>
              </div>

              <YoColFrame
                class="yohu-logs__list"
                template={logDocTrackTemplate(docLayout())}
              >
                <YoColRow class="yohu-logs__cols yohu-logs__cols--head">
                  <For each={visibleLogColumns(displayColumns())}>
                    {(col) => (
                      <YoColHeader
                        align={col.align}
                        resizable={!col.flex}
                        resizeLabel={col.resizeLabel}
                        width={logStore.state.colWidths[col.key]}
                        minWidth={col.key === "ts" ? tsFieldPx(docLayout().timeFormat) : col.minWidth}
                        onWidthChange={(width) => logStore.setColWidth(col.key, width)}
                      >
                        {col.header}
                      </YoColHeader>
                    )}
                  </For>
                </YoColRow>
                <div
                  class="yohu-logs__list-body"
                  ref={(el) => { setListEl(el); }}
                >
                  <YoVirtualList<ViewRow>
                    items={() => logStore.state.sessions.find((s) => s.id === session.id)?.visible ?? []}
                    getItemKey={rowKey}
                    autoScrollToBottom={() => session.following && !session.paused}
                    onAtBottomChange={(atBottom) => {
                      const rows =
                        logStore.state.sessions.find((s) => s.id === session.id)?.visible ?? [];
                      if (atBottom) logStore.resumeFollow(session.id);
                      else if (rows.length > 0) logStore.detachFollow(session.id);
                    }}
                      ariaLabel="日志列表"
                      onRowContextMenu={(row, _key, event) => {
                        setContextLine(row.line);
                        const scope = pick();
                        const canCopy = copyHasPayload({
                          pick: scope,
                          listRoot: listEl(),
                          selection: window.getSelection(),
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
                      renderRow={(row) => {
                        const key = levelKey(row.line.level);
                        const paint = key ? levelPaint(key) : null;
                        return (
                        <div
                          class="yohu-logs__cols yohu-logs__row"
                          data-seq={String(row.line.seq)}
                          data-level={key ?? undefined}
                          data-paint={paint?.invert ? "invert" : undefined}
                          data-tint-msg={paint?.tintMessage ? "" : undefined}
                          style={key ? (levelInkStyle(key) as JSX.CSSProperties) : undefined}
                          classList={{
                            "yohu-logs__row--signal": row.signal !== undefined,
                            "yohu-logs__row--raw": row.line.level === "?",
                            "yohu-logs__row--picked": pick().kind === "all",
                          }}
                        >
                          <LogLineDoc row={row} keyword={session.keyword} layout={docLayout} />
                        </div>
                        );
                      }}
                    />
                    <Show
                      when={
                        (logStore.state.sessions.find((s) => s.id === session.id)?.visible.length ?? 0) === 0
                      }
                    >
                      <SessionEmpty session={session} />
                    </Show>
                </div>
                <Show when={session.pendingCount > 0}>
                  <div class="yohu-logs__pending">
                    <YoButton variant="outlined" tone="neutral" onClick={() => logStore.resumeFollow(session.id)}>
                      {session.pendingCount} 条新日志
                    </YoButton>
                  </div>
                </Show>
              </YoColFrame>

              <div class="yohu-logs__status">
                <span class="yohu-logs__status-capture">
                  <span
                    class="yohu-logs__status-dot"
                    classList={{ "yohu-logs__status-dot--on": sessionCapturePhase(session) === "live" }}
                  />
                  {sessionCaptureLabel(sessionCapturePhase(session))}
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
            <YoButton variant="ghost" tone="neutral" onClick={() => setRenameTarget(null)}>
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
        <YoTextField block label="会话标题" value={renameText()} onInput={setRenameText} />
      </YoDialog>

      <YoToaster toaster={toaster} />
    </YoPage>
  );
}
