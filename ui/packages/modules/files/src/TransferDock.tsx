/**
 * 底部传输坞：作业列表。Presence rise + 一层 Collapse。
 * 行是作业本身，不再套第二张卡、不再套第二根滚轴。
 */
import { For, Show } from "solid-js";

import {
  Icon,
  Layout,
  YoBadge,
  YoButton,
  YoCollapse,
  YoIconButton,
  YoPanel,
  YoPresence,
  YoProgressBar,
  YoTooltip,
} from "@yohu/ui";

import { formatSize } from "./model";
import {
  transferFaultText,
  transferIndeterminate,
  transferLabel,
  transferPercent,
  transferTone,
  type TransferJob,
} from "./transfer-model";
import { transferStore } from "./transfers";

function runningCount(): number {
  return transferStore.transfers.filter((job) => job.state === "running").length;
}

function collapsedSummary(): string {
  const running = transferStore.transfers.find((job) => job.state === "running");
  return running?.name ?? transferStore.transfers[0]?.name ?? "";
}

function TransferRow(props: { job: TransferJob }) {
  const job = (): TransferJob => props.job;
  return (
    <div
      class="yohu-files__transfer"
      classList={{
        "yohu-recipe-dismiss-fade": job().state !== "running",
        "yohu-files__transfer--failed": job().state === "failed",
      }}
    >
      <YoTooltip content={job().direction === "push" ? "上传" : "下载"}>
        <span class="yohu-files__transfer-dir" tabIndex={0}>
          <Icon name={job().direction === "push" ? "arrow-up" : "arrow-down"} size={Layout.IconInline} />
        </span>
      </YoTooltip>
      <div class="yohu-files__transfer-body">
        <div class="yohu-files__transfer-head">
          <span class="yohu-files__transfer-name">{job().name}</span>
          <YoBadge text={transferLabel(job().state)} tone={transferTone(job().state)} />
          <Show when={job().state === "running"}>
            <YoIconButton
              icon="close"
              title="取消传输"
              onClick={(event) => {
                event.stopPropagation();
                void transferStore.cancel(job().id);
              }}
            />
          </Show>
        </div>
        <YoProgressBar
          value={transferPercent(job().bytes, job().total)}
          indeterminate={transferIndeterminate(job().state, job().total)}
        />
        <div class="yohu-files__transfer-meta">
          {formatSize(job().bytes)}
          {job().total ? ` / ${formatSize(job().total!)}` : ""}
          <Show when={job().speed !== undefined && job().state === "running"}>
            <span class="yohu-files__transfer-speed">· {formatSize(job().speed!)}/s</span>
          </Show>
        </div>
        <Show when={transferFaultText(job().fault)}>
          <div class="yohu-files__transfer-msg">{transferFaultText(job().fault)}</div>
        </Show>
      </div>
    </div>
  );
}

export function TransferDock() {
  const hasJobs = () => transferStore.transfers.length > 0;
  const listOpen = () => transferStore.ui.transfersOpen;

  return (
    <YoPresence when={hasJobs()} recipe="rise">
      <YoPanel class="yohu-files__transfers" padding="none" overflow="hidden" header={
        <YoButton
          variant="ghost"
          tone="neutral"
          block
          aria-expanded={listOpen()}
          aria-controls="yohu-files-transfer-list"
          aria-label={listOpen() ? "收起传输" : "展开传输"}
          onClick={() => transferStore.toggleTransfers()}
        >
          <span class="yohu-files__transfer-bar">
            <span
              classList={{
                "yohu-recipe-tree-chevron": true,
                "yohu-recipe-tree-chevron--open": listOpen(),
              }}
            >
              <Icon name="chevron-down" size={Layout.IconInline} />
            </span>
            <span class="yohu-files__transfer-title">传输</span>
            <YoBadge
              text={String(transferStore.transfers.length)}
              tone={runningCount() > 0 ? "accent" : "neutral"}
            />
            <Show when={!listOpen() && collapsedSummary()}>
              <span class="yohu-files__transfer-summary">{collapsedSummary()}</span>
            </Show>
          </span>
        </YoButton>
      }>
        <YoCollapse open={listOpen()} recipe="panel">
          <div id="yohu-files-transfer-list" class="yohu-files__transfer-list">
            <For each={transferStore.transfers}>
              {(job) => <TransferRow job={job} />}
            </For>
          </div>
        </YoCollapse>
      </YoPanel>
    </YoPresence>
  );
}
