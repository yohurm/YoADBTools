/**
 * YoPresence —— 进场挂载、出场播完再卸载（动画系统-v6.md L2）。
 * DOM：`.yohu-presence[data-state][data-recipe]` + display:contents（list/chip 改为 grid 裁切）。
 */
import { Show, createEffect, createRenderEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { motionDurationMs } from "../../../tokens/motion";
import {
  PRESENCE_EXIT_DURATION,
  PRESENCE_EXIT_SAFETY_MS,
  presenceClipProperty,
  presenceUsesClip,
  type PresenceRecipe,
} from "../../spec/recipes";
import { shouldSkipMotion } from "../../reduced";
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
  const [present, setPresent] = createSignal(Boolean(props.when));
  const [state, setState] = createSignal<"open" | "closed">(props.when ? "open" : "closed");
  const [exiting, setExiting] = createSignal(false);
  let host: HTMLDivElement | undefined;
  let exitGen = 0;

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
   * 对照 corvu/Radix：visible = show || present。clip 配方仍由 createEffect 双 rAF。
   */
  createRenderEffect(() => {
    if (!props.when) return;
    setPresent(true);
    setExiting(false);
    const recipe = props.recipe ?? "fade";
    if (presenceUsesClip(recipe) && !shouldSkipMotion()) return;
    setState("open");
  });

  createEffect(() => {
    const want = props.when;
    const recipe = props.recipe ?? "fade";
    if (want) {
      const gen = ++exitGen;
      setExiting(false);
      setPresent(true);
      if (presenceUsesClip(recipe) && !shouldSkipMotion()) {
        setState("closed");
        let raf2 = 0;
        const raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(() => {
            if (gen !== exitGen) return;
            setState("open");
          });
        });
        onCleanup(() => {
          window.cancelAnimationFrame(raf1);
          window.cancelAnimationFrame(raf2);
        });
        return;
      }
      setState("open");
      return;
    }
    if (!present()) return;
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
      const clip = presenceClipProperty(recipe);
      if (!clip || event.propertyName !== clip) return;
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

  const recipe = () => props.recipe ?? "fade";

  return (
    <Show when={props.when || present()}>
      <div
        ref={(el) => {
          host = el;
        }}
        class="yohu-presence"
        data-state={state()}
        data-recipe={presenceHostRecipe(recipe())["data-recipe"]}
        data-exiting={exiting() ? "" : undefined}
        data-first={props.first ? "" : undefined}
      >
        {presenceUsesClip(recipe()) ? <div class="yohu-presence__clip">{props.children}</div> : props.children}
      </div>
    </Show>
  );
}
