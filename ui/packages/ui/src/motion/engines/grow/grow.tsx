/**
 * YoGrow —— 内容用后高（L4）。
 * 公开 API：spec + enabled + children。
 * 意图由子树当拍 command()。量槽内标记盒或第一子盒，只写宿主 height。
 * 不知道 Dialog、Chip、滚条、TextField。
 */
import { createContext, createSignal, onCleanup, useContext } from "solid-js";
import type { JSX } from "solid-js";
import type { MotionSpecName } from "../../../tokens/motion";
import { GROW_SPEC } from "../../spec/recipes";
import { bindGrow, type GrowController } from "./grow-bind";

export interface GrowCommandApi {
  snapshot(): void;
  command(): void;
  traveling: () => boolean;
}

const GrowCommand = createContext<GrowCommandApi | undefined>();

export interface YoGrowProps {
  /** 行程 spec。缺省 spatialGrow。 */
  spec?: MotionSpecName;
  /** 关则冻锁，不再起程。缺省 true。 */
  enabled?: boolean;
  children: JSX.Element;
}

export function YoGrow(props: YoGrowProps): JSX.Element {
  const [traveling, setTraveling] = createSignal(false);
  let ctl: GrowController | undefined;

  const api: GrowCommandApi = {
    snapshot: () => ctl?.snapshot(),
    command: () => ctl?.command(),
    traveling,
  };

  onCleanup(() => {
    ctl?.dispose();
    ctl = undefined;
  });

  return (
    <GrowCommand.Provider value={api}>
      <div
        class="yohu-grow"
        ref={(el) => {
          ctl?.dispose();
          ctl = bindGrow(el, {
            enabled: () => props.enabled !== false,
            spec: () => props.spec ?? GROW_SPEC,
            onTraveling: setTraveling,
          });
          ctl.snapshot();
          ctl.command();
        }}
        data-spec={props.spec ?? GROW_SPEC}
      >
        <div class="yohu-grow__slot">{props.children}</div>
      </div>
    </GrowCommand.Provider>
  );
}

/** 渲染期取命令。无 YoGrow 祖先时得到 undefined，调用方不得报错。 */
export function useGrow(): GrowCommandApi | undefined {
  return useContext(GrowCommand);
}
