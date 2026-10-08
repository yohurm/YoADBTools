/**
 * YoDragPile —— 多选拖动的 Gather 预览（L4）。
 * 每张牌的 left/top 钉在自己的行上。跟指针时用平移叠到指针处。
 * 没落到目标时按行从上到下逐张飞回，落到后淡出，再放下张。
 * 落到目标时整批同时飞到落点。
 * 不套 YoChip / YoBadge。牌面与角标都用 YoCorner。
 */
import { For, Show, createEffect, onCleanup } from "solid-js";
import type { JSX } from "solid-js";

import { CornerPillRadius, YoCorner } from "../corner";
import { Icon, isIconName, type IconName } from "../icons";
import { presenceAttr } from "../dom/flag";
import { Layout } from "../tokens/layout";
import {
  playGatherRelease,
  gatherStackTransform,
  type GatherPlate,
  type GatherPoint,
} from "./gather-release";
import {
  GATHER_LIFT_SCALE,
  dragPileShowsCount,
  gatherPaint,
  resolveDragPilePhase,
  type DragPilePhase,
} from "./drag-pile-model";
import { dragPileHostAttrs } from "./drag-pile-policy";
import "./DragPile.css";

export interface DragPileFace {
  id: string;
  label: string;
  leading?: IconName;
}

export interface YoDragPileProps {
  /** 第 0 张是抓起的那条，后面按清单顺序。每张都会画，不只画前三张。 */
  faces: readonly DragPileFace[];
  /** 整批条数。1 不画角标。 */
  count: number;
  /** carry 跟指针；home 逐张回自己的行；drop 整批去落点。 */
  phase?: DragPilePhase;
  /** 与 faces 对齐，每张牌对应行的左上角。 */
  origins: readonly GatherPoint[];
  /** 跟指针时叠层的左上角。 */
  stack: GatherPoint;
  /** drop 时整批要去的左上角。 */
  dropAt?: GatherPoint;
  /** 一张牌已经落到自己的行上。 */
  onArrive?: (id: string) => void;
  /** home 全部放完，或 drop 整批到达。 */
  onDone?: () => void;
}

function PileChrome(props: { face: DragPileFace }): JSX.Element {
  const icon = () => (isIconName(props.face.leading) ? props.face.leading : undefined);
  return (
    <YoCorner
      role="control"
      class="yohu-drag-pile__chrome"
      direction="row"
      align="center"
      gap="xs"
      pad="inline-sm"
      overflow="hidden"
    >
      <Show when={icon()}>
        {(name) => (
          <span class="yohu-drag-pile__leading">
            <Icon name={name()} size={Layout.IconSm} />
          </span>
        )}
      </Show>
      <span class="yohu-drag-pile__label">{props.face.label}</span>
    </YoCorner>
  );
}

function readPlates(host: HTMLElement): GatherPlate[] {
  return [...host.querySelectorAll<HTMLElement>(".yohu-drag-pile__plate")].map((el) => ({
    el,
    id: el.dataset.face ?? "",
    originX: Number.parseFloat(el.style.left) || 0,
    originY: Number.parseFloat(el.style.top) || 0,
  }));
}

function writeCarry(host: HTMLElement, stack: GatherPoint, origins: readonly GatherPoint[]): void {
  const nodes = host.querySelectorAll<HTMLElement>(".yohu-drag-pile__plate");
  nodes.forEach((el, slot) => {
    const origin = origins[slot] ?? { x: 0, y: 0 };
    const paint = gatherPaint(slot);
    el.style.left = `${origin.x}px`;
    el.style.top = `${origin.y}px`;
    el.style.transform = gatherStackTransform(origin, stack, paint.angle, GATHER_LIFT_SCALE);
    el.style.opacity = String(paint.opacity);
    el.style.zIndex = String(40 - slot);
  });
}

export function YoDragPile(props: YoDragPileProps): JSX.Element {
  const phase = (): DragPilePhase => resolveDragPilePhase(props.phase);
  const host = () => dragPileHostAttrs(phase());
  let root: HTMLDivElement | undefined;
  let arrive: YoDragPileProps["onArrive"] = props.onArrive;
  let done: YoDragPileProps["onDone"] = props.onDone;
  arrive = props.onArrive;
  done = props.onDone;

  createEffect(() => {
    const current = phase();
    const pile = root;
    if (!pile) return;
    if (current === "carry") {
      writeCarry(pile, props.stack, props.origins);
      return;
    }
    const plates = readPlates(pile);
    const dropAt = current === "drop" ? props.dropAt : undefined;
    let dead = false;
    onCleanup(() => {
      dead = true;
      for (const plate of plates) {
        for (const animation of plate.el.getAnimations?.() ?? []) animation.cancel();
      }
    });
    void playGatherRelease({
      plates,
      mode: current,
      dropAt,
      onArrive: (id) => arrive?.(id),
      aborted: () => dead,
    }).then(() => {
      if (!dead) done?.();
    });
  });

  return (
    <div
      ref={(el) => {
        root = el;
      }}
      class="yohu-drag-pile"
      data-recipe="gather"
      data-phase={host()["data-phase"]}
      data-ready=""
      aria-hidden="true"
    >
      <For each={props.faces}>
        {(face, index) => {
          const origin = () => props.origins[index()] ?? { x: 0, y: 0 };
          return (
            <div
              class="yohu-drag-pile__plate"
              data-face={face.id}
              data-front={presenceAttr(index() === 0)}
              data-back={presenceAttr(index() > 0)}
              style={{
                left: `${origin().x}px`,
                top: `${origin().y}px`,
              }}
            >
              <PileChrome face={face} />
              <Show when={index() === 0 && dragPileShowsCount(props.count)}>
                <span class="yohu-drag-pile__badge">
                  <YoCorner
                    role="control"
                    radius={CornerPillRadius}
                    stroke={false}
                    direction="row"
                    align="center"
                    justify="center"
                    pad="inline-sm"
                  >
                    {String(props.count)}
                  </YoCorner>
                </span>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
