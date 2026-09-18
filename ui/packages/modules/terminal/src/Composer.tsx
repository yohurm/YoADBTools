/**
 * 发送栏：队列在 store；纸飞机 sendAll。弱多行走 YoTextField multiline，不是第二套皮。
 */

import { Show } from "solid-js";

import { Icon, YoBadge, YoButton, YoChip, YoIconButton, YoListPresence, YoTextField } from "@yohu/ui";

import { commandBlockGapLabel } from "./block-gap";

import { formatAdbLine } from "./command-line";
import { terminalStore, type QueuedSend } from "./store";

function queuedLeading(item: QueuedSend): "terminal" | "block" | "folder" {
  if (item.kind === "block") return "block";
  if (item.kind === "group") return "folder";
  return "terminal";
}

function queuedText(item: QueuedSend): string {
  if (item.kind === "line") return `${item.title} · ${formatAdbLine("-", item.line)}`;
  if (item.kind === "block") {
    return `${item.title} · ${item.block.steps.length} 条 · 间隔 ${commandBlockGapLabel(item.block.gap_ms)}`;
  }
  return `${item.title} · ${item.group.entries.length} 条`;
}

export function Composer(props: { serials: string[] }) {
  const running = (): boolean => terminalStore.session.busy;
  const open = (): boolean => terminalStore.session.composerOpen;
  const canSend = (): boolean => terminalStore.canSend();

  const onComposerKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    event.preventDefault();
    void terminalStore.sendAll(props.serials);
  };

  return (
    <div
      class="yohu-terminal__dock yohu-recipe-inline-end"
      data-open={open() ? "true" : "false"}
    >
      <div
        class="yohu-terminal__composer-clip"
        aria-hidden={!open() || undefined}
        inert={!open() ? true : undefined}
      >
        <div class="yohu-terminal__composer-pane">
          <div class="yohu-terminal__queue" role="list">
            <YoListPresence each={terminalStore.session.queue} key={(item) => item.id}>
              {(item) => (
                <div class="yohu-terminal__queue-item" role="listitem">
                  <YoChip
                    tone="neutral"
                    leading={queuedLeading(item)}
                    text={queuedText(item)}
                    onDismiss={() => terminalStore.removeQueued(item.id)}
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
              onClick={() => terminalStore.setComposerOpen(false)}
            />
            <div class="yohu-terminal__composer-field">
              <YoTextField
                block
                multiline
                font="mono"
                rows={1}
                ariaLabel="命令"
                value={terminalStore.session.draft}
                disabled={running()}
                onInput={(value) => terminalStore.setDraft(value)}
                onKeyDown={onComposerKey}
              />
            </div>
            <span
              class="yohu-terminal__send yohu-recipe-send-aim"
              data-armed={canSend() ? "true" : "false"}
            >
              <YoIconButton
                icon="send"
                title="发送"
                loading={running()}
                disabled={!canSend() || running()}
                onClick={() => void terminalStore.sendAll(props.serials)}
              />
            </span>
          </div>
        </div>
      </div>
      <div
        class="yohu-terminal__toggle-clip"
        aria-hidden={open() || undefined}
        inert={open() ? true : undefined}
      >
        <YoButton
          buttonStyle="normal"
          tone="neutral"
          block
          aria-expanded={false}
          aria-label="展开输入"
          onClick={() => terminalStore.setComposerOpen(true)}
        >
          <Icon name="chevron-left" />
          <Show when={terminalStore.session.queue.length > 0}>
            <YoBadge text={String(terminalStore.session.queue.length)} tone="accent" />
          </Show>
        </YoButton>
      </div>
    </div>
  );
}
