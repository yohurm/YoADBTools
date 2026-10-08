/**
 * 发送栏：队列在 store；纸飞机 sendAll。弱多行走 YoTextField multiline，不是第二套皮。
 */

import { Show } from "solid-js";

import {
  closedAttr,
  enterKey,
  flagAttr,
  Icon,
  YoBadge,
  YoButton,
  YoChip,
  YoIconButton,
  YoListPresence,
  YoTextField,
  type IconName,
} from "@yohu/ui";

import { commandBlockSummary } from "./block-gap";

import { entryIsBlock } from "@yohu/api";
import { commandCopyText, queuedIsLine } from "./command-line";
import { terminalStore, type QueuedSend } from "./store";

function queuedLeading(item: QueuedSend): IconName {
  if (entryIsBlock(item)) return "block";
  return "terminal";
}

function queuedText(item: QueuedSend): string {
  if (queuedIsLine(item)) return `${item.title} · ${commandCopyText(item.line)}`;
  return `${item.title} · ${commandBlockSummary(item.block.steps.length, item.block.gap_ms)}`;
}

export function Composer(props: { serials: string[] }) {
  const running = (): boolean => terminalStore.busy();
  const open = (): boolean => terminalStore.session.composerOpen;
  const canSend = (): boolean => terminalStore.canSend();

  function sendComposer(): void {
    void terminalStore.sendAll(props.serials);
  }

  const onComposerKey = (event: KeyboardEvent): void => {
    if (!enterKey(event.key)) return;
    if (event.shiftKey) return;
    event.preventDefault();
    sendComposer();
  };

  return (
    <div
      class="yohu-terminal__dock yohu-recipe-inline-end"
      data-open={flagAttr(open())}
    >
      <div
        class="yohu-terminal__composer-clip"
        data-part="clip"
        aria-hidden={closedAttr(open())}
        inert={closedAttr(open())}
      >
        <div class="yohu-terminal__composer-pane" data-part="pane">
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
              data-armed={flagAttr(canSend())}
            >
              <YoIconButton
                icon="send"
                title="发送"
                loading={running()}
                disabled={!canSend() || running()}
                onClick={sendComposer}
              />
            </span>
          </div>
        </div>
      </div>
      <div
        class="yohu-terminal__toggle-clip"
        data-part="toggle"
        aria-hidden={closedAttr(!open())}
        inert={closedAttr(!open())}
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
