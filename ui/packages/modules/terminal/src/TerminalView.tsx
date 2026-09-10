/**
 * 终端主视图：左侧命令库树 + 右侧输入/输出流 + 底部可收缩发送栏。
 * 点预设命令排队到输入框上方（Cursor 排队发送）；纸飞机发送队列与草稿。
 */

import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

import {
  Icon,
  YoBadge,
  YoButton,
  YoChrome,
  YoDialog,
  YoEmptyState,
  YoIconButton,
  YoListPresence,
  YoPage,
  YoPanel,
  YoTextField,
  YoTree,
  YoTooltip,
  motionSpecMs,
  shouldSkipMotion,
} from "@yohu/ui";
import type { TreeNode } from "@yohu/ui";
import type { CommandDto, CommandGroupDto, DeviceSession } from "@yohu/api";
import { ModuleTitle } from "@yohu/api";

import { CommandManager } from "./CommandManager";
import { commandBody, commandNeedsInput, fillTemplate, formatAdbLine, placeholderArity } from "./command-line";
import { terminalStore, type IoLine } from "./store";
import "./terminal.css";

interface QueuedSend {
  id: number;
  title: string;
  line: string;
}

let nextQueueId = 1;

/** 库命令占位符填值（填完进入排队，不立刻发送）。 */
function ParameterDialog(props: {
  command: CommandDto;
  open: () => boolean;
  onClose: () => void;
  onSubmit: (values: string[]) => void;
}) {
  const arity = () => placeholderArity(props.command.template);
  const [values, setValues] = createSignal<string[]>([]);

  createEffect(() => {
    if (props.open()) {
      setValues(Array.from({ length: arity() }, () => ""));
    }
  });

  const submit = (): void => {
    const live = fieldsRoot
      ? Array.from(fieldsRoot.querySelectorAll("input")).map((el) => (el as HTMLInputElement).value)
      : values();
    props.onSubmit(live.length > 0 ? live : values());
    props.onClose();
  };

  let fieldsRoot: HTMLDivElement | undefined;

  return (
    <YoDialog
      open={props.open}
      title={`填写参数: ${props.command.name}`}
      onClose={props.onClose}
      footer={
        <>
          <YoButton variant="ghost" tone="neutral" onClick={props.onClose}>
            取消
          </YoButton>
          <YoButton onClick={submit}>加入队列</YoButton>
        </>
      }
    >
      <div
        class="yohu-terminal__params"
        ref={(el) => {
          fieldsRoot = el;
        }}
      >
        <For each={Array.from({ length: arity() }, (_, i) => i)}>
          {(index) => (
            <YoTextField
              label={`参数 ${index + 1}`}
              value={values()[index] ?? ""}
              onInput={(v) => setValues((vs) => vs.map((old, i) => (i === index ? v : old)))}
            />
          )}
        </For>
      </div>
    </YoDialog>
  );
}

function IoRow(props: { line: IoLine }) {
  return (
    <div class="yohu-terminal__line" data-kind={props.line.kind}>
      <span
        class="yohu-terminal__mark"
        classList={{
          "yohu-terminal__mark--in": props.line.kind === "in",
          "yohu-terminal__mark--out": props.line.kind === "out",
        }}
      >
        {props.line.kind === "in" ? ">>>" : "<<<"}
      </span>
      <time class="yohu-terminal__line-time">{props.line.time}</time>
      <span class="yohu-terminal__line-text">{props.line.text}</span>
    </div>
  );
}

export function TerminalView(props: DeviceSession) {
  const [busy, setBusy] = createSignal(false);
  const [managerOpen, setManagerOpen] = createSignal(false);
  const [inputCommand, setInputCommand] = createSignal<CommandDto | null>(null);
  const [inputOpen, setInputOpen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [composerOpen, setComposerOpen] = createSignal(true);
  const [queue, setQueue] = createSignal<QueuedSend[]>([]);

  let resultBox: HTMLDivElement | undefined;

  onMount(() => {
    void terminalStore.load();
  });

  createEffect(() => {
    terminalStore.setPrependAdb(props.settings.terminal_prepend_adb);
  });

  createEffect(() => {
    const count = terminalStore.lines.length;
    void count;
    const box = resultBox;
    if (!box) return;
    const pin = (): void => {
      box.scrollTop = box.scrollHeight;
    };
    pin();
    if (shouldSkipMotion()) return;
    const started = performance.now();
    const hold = motionSpecMs("spatialLocal");
    let frame = 0;
    const tick = (now: number): void => {
      pin();
      if (now - started < hold) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    onCleanup(() => window.cancelAnimationFrame(frame));
  });

  const treeData = createMemo<TreeNode<CommandDto | CommandGroupDto>[]>(() =>
    terminalStore.library.groups.map((group) => ({
      key: `g:${group.id}`,
      label: group.name,
      icon: "folder" as const,
      data: group,
      badge: String(group.commands.length),
      children: group.commands.map((command) => ({
        key: `c:${command.id}`,
        label: command.name,
        icon: "terminal" as const,
        data: command,
        title: formatAdbLine("-", command.template),
      })),
    })),
  );

  const hasLines = (): boolean => terminalStore.lines.length > 0;
  const running = (): boolean => busy();
  const canSend = (): boolean => queue().length > 0 || draft().trim().length > 0;

  const enqueueLine = (title: string, line: string): void => {
    const body = commandBody(line);
    if (!body) return;
    setQueue((items) => [...items, { id: nextQueueId++, title, line: body }]);
    setComposerOpen(true);
  };

  const removeQueued = (id: number): void => {
    setQueue((items) => items.filter((item) => item.id !== id));
  };

  const onTreeSelect = (key: string, node: TreeNode<CommandDto | CommandGroupDto>): void => {
    if (!key.startsWith("c:")) return;
    const command = node.data;
    if (!command || !("template" in command)) return;
    if (commandNeedsInput(command.template)) {
      setInputCommand(command);
      setInputOpen(true);
      return;
    }
    enqueueLine(command.name, command.template);
  };

  const sendAll = (): void => {
    if (running() || !canSend()) return;
    const items = queue();
    const text = draft().trim();
    setQueue([]);
    setDraft("");
    setBusy(true);
    void (async () => {
      try {
        for (const item of items) {
          await terminalStore.send(props.selectedSerials, item.line);
        }
        if (text) {
          await terminalStore.send(props.selectedSerials, text);
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  const onComposerKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    event.preventDefault();
    sendAll();
  };

  return (
    <YoPage class="yohu-terminal">
      <YoChrome title={ModuleTitle.Terminal} deviceLabel={props.selectedLabel ?? undefined}>
        <YoButton variant="outlined" tone="neutral" onClick={() => terminalStore.clearResults()} disabled={!hasLines()}>
          清屏
        </YoButton>
        <YoButton variant="outlined" tone="neutral" onClick={() => setManagerOpen(true)}>
          命令管理
        </YoButton>
      </YoChrome>

      <div class="yohu-terminal__body">
        <YoPanel variant="pane" padding="sm">
          <Show
            when={treeData().length > 0}
            fallback={
              <YoEmptyState icon="terminal" title="命令库为空" description="点击「命令管理」添加命令" />
            }
          >
            <YoTree
              data={treeData()}
              defaultExpandedKeys={terminalStore.library.groups.map((g) => `g:${g.id}`)}
              onSelect={onTreeSelect}
            />
          </Show>
        </YoPanel>

        <YoPanel
          class="yohu-terminal__output"
          variant="pane"
          padding="none"
          title="执行结果"
          actions={
            <Show when={running()}>
              <YoBadge text="执行中" tone="warning" />
            </Show>
          }
        >
          <div class="yohu-terminal__stage">
            <div
              class="yohu-terminal__stream"
              classList={{ "yohu-terminal__stream--empty": !hasLines() }}
              ref={(el) => {
                resultBox = el;
              }}
            >
              <Show
                when={hasLines()}
                fallback={
                  <YoEmptyState
                    icon="terminal"
                    title="暂无执行结果"
                    description="点左侧命令加入队列，或在下方输入后发送"
                  />
                }
              >
                <YoListPresence each={terminalStore.lines} key={(line) => line.id} exit={false}>
                  {(line) => <IoRow line={line} />}
                </YoListPresence>
              </Show>
            </div>

            <div
              class="yohu-terminal__dock yohu-recipe-inline-end"
              data-open={composerOpen() ? "true" : "false"}
            >
              <div
                class="yohu-terminal__composer-clip"
                aria-hidden={!composerOpen() || undefined}
                inert={!composerOpen() ? true : undefined}
              >
                <div class="yohu-terminal__composer-pane">
                  <div class="yohu-terminal__queue" role="list">
                    <YoListPresence each={queue()} key={(item) => item.id}>
                      {(item) => (
                        <div class="yohu-terminal__queue-item" role="listitem">
                          <span class="yohu-terminal__queue-title">{item.title}</span>
                          <YoTooltip content={formatAdbLine("-", item.line)} block>
                            <span class="yohu-terminal__queue-line">{formatAdbLine("-", item.line)}</span>
                          </YoTooltip>
                          <YoIconButton
                            icon="close"
                            title="移出队列"
                            onClick={() => removeQueued(item.id)}
                          />
                        </div>
                      )}
                    </YoListPresence>
                  </div>
                  <div class="yohu-terminal__composer">
                    <YoIconButton
                      icon="chevron-right"
                      title="收起输入"
                      aria-expanded={true}
                      onClick={() => setComposerOpen(false)}
                    />
                    <textarea
                      class="yohu-terminal__composer-input yohu-focus-ring"
                      rows={1}
                      aria-label="命令"
                      value={draft()}
                      disabled={running()}
                      onInput={(event) => setDraft(event.currentTarget.value)}
                      onKeyDown={onComposerKey}
                    />
                    <span class="yohu-terminal__send">
                      <YoIconButton
                        icon="send"
                        title="发送"
                        loading={running()}
                        disabled={!canSend() || running()}
                        onClick={sendAll}
                      />
                    </span>
                  </div>
                </div>
              </div>
              <div
                class="yohu-terminal__toggle-clip"
                aria-hidden={composerOpen() || undefined}
                inert={composerOpen() ? true : undefined}
              >
                <YoTooltip content="展开输入">
                <button
                  type="button"
                  class="yohu-terminal__dock-toggle yohu-interactive yohu-focus-ring"
                  aria-expanded={false}
                  aria-label="展开输入"
                  onClick={() => setComposerOpen(true)}
                >
                  <Icon name="chevron-left" />
                  <Show when={queue().length > 0}>
                    <YoBadge text={String(queue().length)} tone="accent" />
                  </Show>
                </button>
                </YoTooltip>
              </div>
            </div>
          </div>
        </YoPanel>
      </div>

      <CommandManager open={managerOpen} onClose={() => setManagerOpen(false)} />

      <Show when={inputCommand()}>
        <ParameterDialog
          command={inputCommand()!}
          open={inputOpen}
          onClose={() => {
            setInputOpen(false);
            setInputCommand(null);
          }}
          onSubmit={(values) => {
            const command = inputCommand();
            if (command) {
              enqueueLine(command.name, fillTemplate(command.template, values));
            }
            setInputCommand(null);
          }}
        />
      </Show>
    </YoPage>
  );
}
