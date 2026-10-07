/**
 * YoPresence —— 进场挂载、出场播完再卸载（动画系统-v6.md L2）。
 * DOM：`.yohu-presence[data-state][data-recipe]`。list/chip/toast 用 `__clip` 裁切，位移和最小尺寸在 `__face`。
 * transition：出生 closed，仅本实例 want 上升后双 rAF 开。邻项增删不重挂、不重播。
 */
import { Show, createEffect, createMemo, createRenderEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { motionDurationMs } from "../../../tokens/motion";
import {
  PRESENCE_EXIT_DURATION,
  PRESENCE_EXIT_SAFETY_MS,
  presenceUsesClip,
  presenceExitWatchProperty,
  type PresenceRecipe,
} from "../../spec/recipes";
import { shouldSkipMotion } from "../../reduced";
import { presenceBornState, type PresenceState } from "./presence-model";
import { presenceHostRecipe } from "./presence-policy";
import { presenceAttr } from "../../../dom/flag";

export type { PresenceRecipe };

export interface YoPresenceProps {
  when: boolean;
  recipe?: PresenceRecipe;
  onExitComplete?: () => void;
  /** 短列表当前可见第一项（含出场中）。由 YoListPresence 写入。 */
  first?: boolean;
  children: JSX.Element;
}

function presenceWaitsToOpen(recipe: PresenceRecipe): boolean {
  return presenceUsesClip(recipe) && !shouldSkipMotion();
}

function presenceNextGen(current: number): number {
  return current + 1;
}

function presenceGenStale(gen: number, exitGen: number): boolean {
  return gen !== exitGen;
}

function presenceFinishTimed(timer: number, finish: (gen: number) => void, gen: number): void {
  window.clearTimeout(timer);
  finish(gen);
}

function presenceMarkOpen(setState: (state: PresenceState) => void): void {
  setState("open");
}

function presenceClearExiting(setExiting: (value: boolean) => void): void {
  setExiting(false);
}

function presenceMarkPresent(setPresent: (value: boolean) => void): void {
  setPresent(true);
}

function presenceCancelFrame(id: number): void {
  if (id) window.cancelAnimationFrame(id);
}

function presenceNextFrame(run: () => void): number {
  return window.requestAnimationFrame(run);
}

function presenceWhenFlag(when: boolean): boolean {
  return Boolean(when);
}

function presenceGone(present: boolean): boolean {
  return !present;
}

export function YoPresence(props: YoPresenceProps): JSX.Element {
  const recipeOf = (): PresenceRecipe => props.recipe ?? "fade";
  const [present, setPresent] = createSignal(presenceWhenFlag(props.when));
  const [state, setState] = createSignal<PresenceState>(
    presenceBornState({
      when: presenceWhenFlag(props.when),
      delayOpen: presenceUsesClip(recipeOf()),
      skipMotion: shouldSkipMotion(),
    }),
  );
  const [exiting, setExiting] = createSignal(false);
  let host: HTMLDivElement | undefined;
  let exitGen = 0;
  let enterRaf1 = 0;
  let enterRaf2 = 0;
  const want = createMemo(() => props.when === true);

  const cancelEnterRafs = (): void => {
    presenceCancelFrame(enterRaf1);
    presenceCancelFrame(enterRaf2);
    enterRaf1 = 0;
    enterRaf2 = 0;
  };

  onCleanup(cancelEnterRafs);

  const finishExit = (gen: number): void => {
    if (presenceGenStale(gen, exitGen)) return;
    if (presenceGone(present())) return;
    setPresent(false);
    presenceClearExiting(setExiting);
    props.onExitComplete?.();
  };

  /**
   * 进场：when 变 true 必须同拍挂载。
   * Solid 文档：createEffect 在渲染完成后才跑；Show 只认 present() 会再等一拍 setPresent。
   * 对照 corvu/Radix：visible = show || present。transition 出生已是 closed，这里只负责 keyframes 同拍 open。
   */
  createRenderEffect(() => {
    if (!want()) return;
    presenceMarkPresent(setPresent);
    presenceClearExiting(setExiting);
    const recipe = recipeOf();
    if (presenceWaitsToOpen(recipe)) return;
    presenceMarkOpen(setState);
  });

  createEffect(() => {
    const next = want();
    const recipe = recipeOf();
    if (next) {
      exitGen = presenceNextGen(exitGen);
      const gen = exitGen;
      presenceClearExiting(setExiting);
      presenceMarkPresent(setPresent);
      if (presenceWaitsToOpen(recipe)) {
        cancelEnterRafs();
        enterRaf1 = presenceNextFrame(() => {
          enterRaf2 = presenceNextFrame(() => {
            if (presenceGenStale(gen, exitGen)) return;
            presenceMarkOpen(setState);
          });
        });
        return;
      }
      presenceMarkOpen(setState);
      return;
    }
    if (presenceGone(present())) return;
    cancelEnterRafs();
    exitGen = presenceNextGen(exitGen);
    const gen = exitGen;
    setExiting(true);
    setState("closed");
    if (shouldSkipMotion()) {
      finishExit(gen);
      return;
    }
    const ms = motionDurationMs(PRESENCE_EXIT_DURATION[recipe]) + PRESENCE_EXIT_SAFETY_MS;
    const timer = window.setTimeout(() => finishExit(gen), ms);
    const onAnimationEnd = (event: AnimationEvent): void => {
      if (!String(event.animationName).includes("-out")) return;
      presenceFinishTimed(timer, finishExit, gen);
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target !== host) return;
      const watch = presenceExitWatchProperty(recipe);
      if (!watch || event.propertyName !== watch) return;
      presenceFinishTimed(timer, finishExit, gen);
    };
    const listen = <K extends "animationend" | "transitionend">(
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
    ): (() => void) => {
      host?.addEventListener(type, handler);
      return () => host?.removeEventListener(type, handler);
    };
    const stopAnimationEnd = listen("animationend", onAnimationEnd);
    const stopTransitionEnd = listen("transitionend", onTransitionEnd);
    onCleanup(() => {
      window.clearTimeout(timer);
      stopAnimationEnd();
      stopTransitionEnd();
    });
  });

  return (
    <Show when={props.when || present()}>
      <div
        ref={(el) => {
          host = el;
        }}
        class="yohu-presence"
        data-state={state()}
        data-recipe={presenceHostRecipe(recipeOf())["data-recipe"]}
        data-exiting={presenceAttr(exiting())}
        data-first={presenceAttr(props.first)}
      >
        {presenceUsesClip(recipeOf()) ? (
          <div class="yohu-presence__clip">
            <div class="yohu-presence__face">{props.children}</div>
          </div>
        ) : (
          props.children
        )}
      </div>
    </Show>
  );
}
