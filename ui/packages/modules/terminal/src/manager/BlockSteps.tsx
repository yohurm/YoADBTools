/**
 * 命令块步骤列表。拖动手势只在这里；排序算法走 reorder.ts。
 */

import { For, createSignal } from "solid-js";

import { Icon, YoIconButton, YoTextField } from "@yohu/ui";

import { commandBody, formatAdbLine } from "../command-line";
import type { DraftStep } from "../draft";
import { dropIndexFromCenters, shiftForReorder } from "./reorder";

export function BlockSteps(props: {
  steps: DraftStep[];
  onTemplate: (stepId: string, template: string) => void;
  onAdd: () => void;
  onRemove: (stepId: string) => void;
  onMoveTo: (from: number, to: number) => void;
  onShift: (index: number, delta: number) => void;
}) {
  const [dragFrom, setDragFrom] = createSignal<number | null>(null);
  const [dragOver, setDragOver] = createSignal<number | null>(null);
  const [dragDy, setDragDy] = createSignal(0);

  let stepsHost: HTMLDivElement | undefined;
  let dragSession: { from: number; startY: number; centers: number[]; height: number } | null =
    null;

  const onGripPointerDown = (event: PointerEvent, index: number): void => {
    if (event.button !== 0) return;
    const rows = stepsHost?.querySelectorAll<HTMLElement>(".yohu-cm__step");
    if (!rows || rows.length < 2) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const centers = [...rows].map((el) => {
      const box = el.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    dragSession = {
      from: index,
      startY: event.clientY,
      centers,
      height: rows[index]!.getBoundingClientRect().height,
    };
    setDragFrom(index);
    setDragOver(index);
    setDragDy(0);
  };

  const onGripPointerMove = (event: PointerEvent): void => {
    const session = dragSession;
    if (!session) return;
    setDragDy(event.clientY - session.startY);
    setDragOver(dropIndexFromCenters(session.centers, event.clientY));
  };

  const endGripDrag = (): void => {
    const session = dragSession;
    const over = dragOver();
    dragSession = null;
    setDragFrom(null);
    setDragOver(null);
    setDragDy(0);
    if (session && over !== null) {
      props.onMoveTo(session.from, over);
    }
  };

  const stepDragStyle = (index: number): { transform?: string; "z-index"?: number } | undefined => {
    const from = dragFrom();
    const over = dragOver();
    const session = dragSession;
    if (from === null || over === null || !session) return undefined;
    if (index === from) {
      return { transform: `translateY(${dragDy()}px)`, "z-index": 1 };
    }
    const shift = shiftForReorder(index, from, over);
    if (shift === 0) return undefined;
    return { transform: `translateY(${shift * session.height}px)` };
  };

  return (
    <div
      class="yohu-cm__steps"
      classList={{ "yohu-cm__steps--dragging": dragFrom() !== null }}
      ref={(el) => {
        stepsHost = el;
      }}
    >
      <div class="yohu-cm__steps-head">
        <span class="yohu-cm__caption">步骤</span>
        <YoIconButton icon="plus" title="新增步骤" onClick={() => props.onAdd()} />
      </div>
      <For each={props.steps}>
        {(step, index) => (
          <div
            class="yohu-cm__step"
            classList={{ "yohu-cm__step--dragging": dragFrom() === index() }}
            style={stepDragStyle(index())}
          >
            <button
              type="button"
              class="yohu-cm__step-grip yohu-focus-ring"
              aria-label={`拖动调整步骤 ${index() + 1} 顺序`}
              disabled={props.steps.length <= 1}
              onPointerDown={(event) => onGripPointerDown(event, index())}
              onPointerMove={onGripPointerMove}
              onPointerUp={endGripDrag}
              onPointerCancel={endGripDrag}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  props.onShift(index(), -1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  props.onShift(index(), 1);
                }
              }}
            >
              <Icon name="grip" />
            </button>
            <YoTextField
              block
              ariaLabel={`步骤 ${index() + 1}`}
              value={formatAdbLine("-", step.template)}
              onInput={(v) => props.onTemplate(step.id, commandBody(v))}
            />
            <YoIconButton
              icon="trash"
              title="删除步骤"
              disabled={props.steps.length <= 1}
              onClick={() => props.onRemove(step.id)}
            />
          </div>
        )}
      </For>
    </div>
  );
}
