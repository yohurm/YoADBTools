/**
 * YoCollapse —— 高度槽（动画系统-v6.md）。
 * collapse / panel / fill：0fr/1fr。对话框名单走 YoReveal，不走 Collapse。
 * 子树保持挂载；关闭时 aria-hidden + inert。
 * `__inner` 只裁切高度。`__content` 是配方自己的动画盒。
 * 禁止把位移打在裁切盒上，禁止选择器穿到消费者子树。
 * 开闭行程走 traveling()：YoScroller 订这个，禁止 scrape grid-template-rows。
 */
import { createContext, createEffect, createMemo, createSignal, on, onCleanup, onMount, useContext } from "solid-js";
import type { JSX } from "solid-js";
import { closedAttr } from "../../../dom/flag";
import { motionSpecMs } from "../../../tokens/motion";
import { shouldSkipMotion } from "../../reduced";
import { PRESENCE_EXIT_SAFETY_MS } from "../../spec/recipes";
import {
  COLLAPSE_TRIP_PROPERTY,
  collapseDelaysPaint,
  collapsePaintOpen,
  resolveCollapseTripOnToggle,
  resolveCollapseTripSpec,
  type CollapseFlex,
  type CollapseRecipe,
} from "./collapse-model";
import { collapseHostAttrs } from "./collapse-policy";

export type { CollapseRecipe };

export interface CollapseTravelApi {
  /** 祖先折叠正在插值 0fr↔1fr。落定后变 false，同拍可再量溢出。 */
  traveling: () => boolean;
}

const CollapseTravel = createContext<CollapseTravelApi | undefined>();

/** 渲染期取行程。无 YoCollapse 祖先时得到 undefined，调用方不得报错。 */
export function useCollapseTravel(): CollapseTravelApi | undefined {
  return useContext(CollapseTravel);
}

export interface YoCollapseProps {
  open: boolean;
  /** 默认 collapse（仅高度）。panel = 高度 + 内容淡入上移。fill = 内层填满可收缩。 */
  recipe?: CollapseRecipe;
  /** 父级 flex 里的占位。缺省不写，调用方不得再点 .yohu-collapse。 */
  flex?: CollapseFlex;
  children: JSX.Element;
}

function collapseNextFrame(run: () => void): number {
  return window.requestAnimationFrame(run);
}

function collapseCancelFrame(id: number): void {
  if (id) window.cancelAnimationFrame(id);
}

export function YoCollapse(props: YoCollapseProps): JSX.Element {
  const paintDelay = (): boolean => collapseDelaysPaint(props.recipe, shouldSkipMotion());
  const [revealed, setRevealed] = createSignal(!paintDelay());
  const painted = createMemo(() => collapsePaintOpen(Boolean(props.open), paintDelay(), revealed()));
  const host = createMemo(() =>
    collapseHostAttrs({ open: painted(), recipe: props.recipe, flex: props.flex }),
  );
  const [traveling, setTraveling] = createSignal(false);
  let safety = 0;
  let enter1 = 0;
  let enter2 = 0;

  const clearSafety = (): void => {
    if (safety === 0) return;
    window.clearTimeout(safety);
    safety = 0;
  };

  const finish = (): void => {
    clearSafety();
    setTraveling(false);
  };

  const cancelEnter = (): void => {
    collapseCancelFrame(enter1);
    collapseCancelFrame(enter2);
    enter1 = 0;
    enter2 = 0;
  };

  const arm = (): void => {
    if (!resolveCollapseTripOnToggle(shouldSkipMotion())) {
      finish();
      return;
    }
    setTraveling(true);
    clearSafety();
    safety = window.setTimeout(
      finish,
      motionSpecMs(resolveCollapseTripSpec(props.recipe)) + PRESENCE_EXIT_SAFETY_MS,
    );
  };

  onMount(() => {
    if (!paintDelay()) return;
    enter1 = collapseNextFrame(() => {
      enter2 = collapseNextFrame(() => setRevealed(true));
    });
  });

  createEffect(
    on(painted, (_open, prev) => {
      if (prev === undefined) return;
      arm();
    }),
  );

  onCleanup(() => {
    cancelEnter();
    clearSafety();
  });

  const onTransitionEnd = (event: TransitionEvent): void => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== COLLAPSE_TRIP_PROPERTY) return;
    finish();
  };

  return (
    <CollapseTravel.Provider value={{ traveling }}>
      <div
        class="yohu-collapse"
        data-open={host()["data-open"]}
        data-recipe={host()["data-recipe"]}
        data-flex={host()["data-flex"]}
        onTransitionEnd={onTransitionEnd}
      >
        <div class="yohu-collapse__inner" aria-hidden={closedAttr(props.open)} inert={closedAttr(props.open)}>
          <div class="yohu-collapse__content">{props.children}</div>
        </div>
      </div>
    </CollapseTravel.Provider>
  );
}
