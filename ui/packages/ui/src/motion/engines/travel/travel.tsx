/**
 * YoTravel —— 尺寸跟内容变的盒（L4）。
 * 公开 API：axes + spec + enabled + children。
 * 意图由子树（YoReveal open / 子节点）当拍 command()。
 * children 进自己的 `__slot`；fill / clip 打在槽上，不点裸子。
 * 不知道 Dialog、Chip、滚条。
 */
import { createContext, createMemo, createSignal, onCleanup, useContext } from "solid-js";
import type { JSX } from "solid-js";
import type { MotionSpecName } from "../../../tokens/motion";
import { TRAVEL_SPEC } from "../../spec/recipes";
import { bindTravel, type TravelController } from "./travel-bind";
import { normalizeTravelAxes, type TravelAxis } from "./travel-model";
import { travelAxisAttrs } from "./travel-policy";

export interface TravelCommandApi {
  snapshot(): void;
  command(): void;
  /** 祖先盒正在插值 used。落定后变 false，同拍可再量溢出。 */
  traveling: () => boolean;
}

const TravelCommand = createContext<TravelCommandApi | undefined>();

export interface YoTravelProps {
  /** 要插值的轴。缺省 block。可同时走 inline。 */
  axes?: TravelAxis[];
  /** 行程 spec。缺省 spatialPanel。 */
  spec?: MotionSpecName;
  /** 关则冻锁，不再起程。缺省 true。 */
  enabled?: boolean;
  children: JSX.Element;
}

export function YoTravel(props: YoTravelProps): JSX.Element {
  const axes = createMemo(() => normalizeTravelAxes(props.axes));
  const host = createMemo(() => travelAxisAttrs(axes()));
  const [traveling, setTraveling] = createSignal(false);
  let ctl: TravelController | undefined;

  const api: TravelCommandApi = {
    snapshot: () => ctl?.snapshot(),
    command: () => ctl?.command(),
    traveling,
  };

  onCleanup(() => {
    ctl?.dispose();
    ctl = undefined;
  });

  return (
    <TravelCommand.Provider value={api}>
      <div
        class="yohu-travel"
        ref={(el) => {
          ctl?.dispose();
          ctl = bindTravel(el, {
            enabled: () => props.enabled !== false,
            axes: () => axes(),
            spec: () => props.spec ?? TRAVEL_SPEC,
            onTraveling: setTraveling,
          });
          ctl.snapshot();
          ctl.command();
        }}
        data-axis-block={host()["data-axis-block"]}
        data-axis-inline={host()["data-axis-inline"]}
      >
        <div class="yohu-travel__slot">{props.children}</div>
      </div>
    </TravelCommand.Provider>
  );
}

/** 渲染期取命令。无 YoTravel 祖先时得到 undefined，调用方不得报错。 */
export function useTravel(): TravelCommandApi | undefined {
  return useContext(TravelCommand);
}
