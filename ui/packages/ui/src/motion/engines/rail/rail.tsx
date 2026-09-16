/**
 * YoRail —— 常驻图标轨（动画系统-v6.md 配方 rail）。
 * 列宽跟意图当拍；文案流跟相位当拍。宽 / 高 / 字同一拍软弹簧，可打断。
 */
import { createContext, createEffect, createSignal, on, useContext } from "solid-js";
import type { Accessor, JSX } from "solid-js";

import { shouldSkipMotion } from "../../reduced";
import {
  railPhaseAfterWidthSettle,
  railPhaseOnIntentChange,
  railStreamAttr,
  railWidthMatchesIntent,
  type RailIntent,
  type RailPhase,
} from "./rail-model";

export interface YoRailContextValue {
  intent: Accessor<RailIntent>;
  phase: Accessor<RailPhase>;
}

const RailContext = createContext<YoRailContextValue>();

export function useRail(): YoRailContextValue | undefined {
  return useContext(RailContext);
}

export interface YoRailProps {
  intent: RailIntent;
  class?: string;
  children: JSX.Element;
}

export function YoRail(props: YoRailProps): JSX.Element {
  const intent = () => props.intent;
  const [phase, setPhase] = createSignal<RailPhase>(
    intent() === "expanded" ? "expanded" : "icons",
  );

  createEffect(
    on(
      intent,
      (next) => {
        setPhase(railPhaseOnIntentChange(next, shouldSkipMotion()));
      },
      { defer: true },
    ),
  );

  const onWidthSettled = (event: TransitionEvent): void => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "width" && event.propertyName !== "flex-basis") return;
    const host = event.currentTarget as HTMLElement;
    const styles = getComputedStyle(host);
    if (
      !railWidthMatchesIntent(
        host.offsetWidth,
        intent() === "expanded",
        styles.getPropertyValue("--yohu-layout-shell-nav"),
        styles.getPropertyValue("--yohu-layout-shell-nav-icons"),
      )
    ) {
      return;
    }
    setPhase(railPhaseAfterWidthSettle(intent()));
  };

  return (
    <RailContext.Provider value={{ intent, phase }}>
      <aside
        class={["yohu-recipe-rail", props.class].filter(Boolean).join(" ")}
        data-rail={intent()}
        data-phase={phase()}
        data-stream={railStreamAttr(phase())}
        onTransitionEnd={onWidthSettled}
      >
        {props.children}
      </aside>
    </RailContext.Provider>
  );
}
