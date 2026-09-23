/**
 * YoPresence —— 进场挂载、出场播完再卸载（动画系统-v6.md L2）。
 * DOM：`.yohu-presence[data-state][data-recipe]` + display:contents（list/chip/toast 改为 grid 裁切）。
 * transition：出生 closed，仅本实例 want 上升后双 rAF 开。邻项增删不重挂、不重播。
 */
import { Show, createEffect, createMemo, createRenderEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { motionDurationMs } from "../../../tokens/motion";
import {
  PRESENCE_EXIT_DURATION,
  PRESENCE_EXIT_SAFETY_MS,
  presenceUsesClip,
  presenceUsesTransition,
  presenceExitWatchProperty,
  type PresenceRecipe,
} from "../../spec/recipes";
import { shouldSkipMotion } from "../../reduced";
import { presenceBornState } from "./presence-model";
import { presenceHostRecipe } from "./presence-policy";

export type { PresenceRecipe };

export interface YoPresenceProps {
  when: boolean;
  recipe?: PresenceRecipe;
  onExitComplete?: () => void;
  /** 短列表当前可见第一项（含出场中）。由 YoListPresence 写入。 */
  first?: boolean;
  children: JSX.Element;
}

export function YoPresence(props: YoPresenceProps): JSX.Element {
  const recipeOf = (): PresenceRecipe => props.recipe ?? "fade";
  const [present, setPresent] = createSignal(Boolean(props.when));
  const [state, setState] = createSignal<"open" | "closed">(
    presenceBornState({
      when: Boolean(props.when),
      delayOpen: presenceUsesTransition(recipeOf()),
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
    if (enterRaf1) window.cancelAnimationFrame(enterRaf1);
    if (enterRaf2) window.cancelAnimationFrame(enterRaf2);
    enterRaf1 = 0;
    enterRaf2 = 0;
  };

  onCleanup(cancelEnterRafs);

  const finishExit = (gen: number): void => {
    if (gen !== exitGen) return;
    if (!present()) return;
    setPresent(false);
    setExiting(false);
    props.onExitComplete?.();
  };

  /**
   * 进场：when 变 true 必须同拍挂载。
   * Solid 文档：createEffect 在渲染完成后才跑；Show 只认 present() 会再等一拍 setPresent。
   * 对照 corvu/Radix：visible = show || present。transition 出生已是 closed，这里只负责 keyframes 同拍 open。
   */
  createRenderEffect(() => {
    if (!want()) return;
    setPresent(true);
    setExiting(false);
    const recipe = recipeOf();
    if (presenceUsesTransition(recipe) && !shouldSkipMotion()) return;
    setState("open");
  });

  createEffect(() => {
    const next = want();
    const recipe = recipeOf();
    if (next) {
      const gen = ++exitGen;
      setExiting(false);
      setPresent(true);
      if (presenceUsesTransition(recipe) && !shouldSkipMotion()) {
        cancelEnterRafs();
        enterRaf1 = window.requestAnimationFrame(() => {
          enterRaf2 = window.requestAnimationFrame(() => {
            if (gen !== exitGen) return;
            setState("open");
          });
        });
        return;
      }
      setState("open");
      return;
    }
    if (!present()) return;
    cancelEnterRafs();
    const gen = ++exitGen;
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
      window.clearTimeout(timer);
      finishExit(gen);
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target !== host) return;
      const watch = presenceExitWatchProperty(recipe);
      if (!watch || event.propertyName !== watch) return;
      window.clearTimeout(timer);
      finishExit(gen);
    };
    host?.addEventListener("animationend", onAnimationEnd);
    host?.addEventListener("transitionend", onTransitionEnd);
    onCleanup(() => {
      window.clearTimeout(timer);
      host?.removeEventListener("animationend", onAnimationEnd);
      host?.removeEventListener("transitionend", onTransitionEnd);
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
        data-exiting={exiting() ? "" : undefined}
        data-first={props.first ? "" : undefined}
      >
        {presenceUsesClip(recipeOf()) ? <div class="yohu-presence__clip">{props.children}</div> : props.children}
      </div>
    </Show>
  );
}
