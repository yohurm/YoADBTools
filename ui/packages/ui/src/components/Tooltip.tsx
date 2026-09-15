/**
 * YoTooltip —— 无可见文案铬的气泡（L4 视图 / L5 门面）。
 * 只绑 Presence + 内容区；定位走 tooltip-place → popover-place。
 * 密集提示共享一个 popup（YoTooltipHost）。无 Host 时不画。
 * 内容区绑 paint 槽（活槽或上次非空槽），禁止 `session()?.content ?? ""`：
 * Unique 卸了 Presence 还在播，空铬会再走一遍 popover 渐入渐出。
 * 禁止包已画出的字；省略号不靠气泡复述。图标钮走 YoIconButton.title。
 */
import { createContext, createEffect, createMemo, createSignal, onCleanup, useContext } from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { YoPresence } from "../motion/presence";
import type { MotionSpecName } from "../tokens/motion";
import {
  applyPopoverBox,
  popoverLayerStyle,
  type PopoverPlacement,
} from "./popover-place";
import { allocTooltipId, tooltipDomId } from "./tooltip-model";
import { placeTooltip, readTooltipTrigger } from "./tooltip-place";
import {
  bindTooltipInputModality,
  resolveTooltipDelay,
  tooltipAnchorAttrs,
  tooltipCanShow,
  tooltipCanShowOnFocus,
  tooltipPaintSession,
  tooltipSessionOpen,
  tooltipUnique,
  type TooltipSession,
  type TooltipUnique,
} from "./tooltip-policy";
import "./Tooltip.css";

export interface YoTooltipProps {
  /** 提示文案 */
  content: string;
  /** 锚点（被包裹的孩子） */
  children: JSX.Element;
  /** 出示延迟，MotionSpec 名。缺省 effectsEnter */
  delay?: MotionSpecName;
  /** 禁用：不出现示 */
  disabled?: boolean;
  /** 无文案铬铺满父级主轴（空热区）。缺省 hug 锚点 */
  block?: boolean;
  /** 无文案铬铺满父级交叉轴 */
  stretch?: boolean;
}

export interface YoTooltipHostProps {
  /** 独立 Unique 槽（测试隔离）。不传则用缺省槽。 */
  unique?: TooltipUnique;
  /** 被 Unique 槽覆盖的锚点树。不传则只挂 popup（与缺省槽对接）。 */
  children?: JSX.Element;
}

const TooltipUniqueContext = createContext<TooltipUnique>();

/** Solid 的 children 在父作用域创建，吃不到 Host Provider；由 Host 登记当前槽。 */
let hostedUnique: TooltipUnique = tooltipUnique;

function useTooltipUnique(): TooltipUnique {
  return useContext(TooltipUniqueContext) ?? hostedUnique;
}

/**
 * Unique 浮层树节点。应用根挂一份；密集提示共用这一个 popup。
 */
export function YoTooltipHost(props: YoTooltipHostProps): JSX.Element {
  const unique = (): TooltipUnique => props.unique ?? tooltipUnique;

  createEffect(() => {
    const slot = unique();
    hostedUnique = slot;
    const unbindInput = bindTooltipInputModality();
    onCleanup(() => {
      unbindInput();
      if (hostedUnique === slot) hostedUnique = tooltipUnique;
    });
  });
  const [placement, setPlacement] = createSignal<PopoverPlacement>("top");
  const [layerStyle, setLayerStyle] = createSignal<JSX.CSSProperties>({});
  const [held, setHeld] = createSignal<TooltipSession | null>(null);
  let layerRef: HTMLDivElement | undefined;
  let bubbleRef: HTMLDivElement | undefined;

  const live = createMemo(() => unique().session());
  const paint = createMemo(() => tooltipPaintSession(live(), held()));
  const open = createMemo(() => tooltipSessionOpen(live()));
  const paintId = createMemo(() => {
    const tip = paint();
    return tip ? tooltipDomId(tip.id) : undefined;
  });

  createEffect(() => {
    const tip = live();
    if (tooltipSessionOpen(tip)) setHeld(tip);
  });

  const layout = (): void => {
    const tip = paint();
    const layer = layerRef;
    if (!tip || !layer) return;
    const bubble = bubbleRef;
    const box = placeTooltip(tip.trigger, {
      width: bubble?.scrollWidth ?? 0,
      height: bubble?.scrollHeight ?? 0,
    });
    applyPopoverBox(layer, box);
    setPlacement(box.placement);
    setLayerStyle(popoverLayerStyle(box) as JSX.CSSProperties);
  };

  createEffect(() => {
    if (!open()) return;
    layout();
  });

  return (
    <TooltipUniqueContext.Provider value={unique()}>
      {props.children}
      <Portal mount={document.body}>
        <YoPresence
          when={open()}
          recipe="popover"
          onExitComplete={() => {
            if (!live()) setHeld(null);
          }}
        >
          <div
            ref={(el) => {
              layerRef = el;
              if (el) layout();
            }}
            class="yohu-tooltip__layer"
            data-placement={placement()}
            style={layerStyle()}
          >
            <div
              ref={(el) => {
                bubbleRef = el;
                if (el) layout();
              }}
              id={paintId()}
              class="yohu-tooltip"
              data-placement={placement()}
              role="tooltip"
            >
              <div class="yohu-tooltip__content">{paint()?.content ?? ""}</div>
            </div>
          </div>
        </YoPresence>
      </Portal>
    </TooltipUniqueContext.Provider>
  );
}

/**
 * 锚点包装。只登记 Unique 槽；自己不建 Portal。
 */
export function YoTooltip(props: YoTooltipProps): JSX.Element {
  const unique = useTooltipUnique();
  const id = allocTooltipId();
  let anchorRef: HTMLSpanElement | undefined;

  const show = (): void => {
    if (!tooltipCanShow(props.disabled, props.content)) return;
    unique.requestShow(
      { id, content: props.content, trigger: readTooltipTrigger(anchorRef) },
      resolveTooltipDelay(props.delay),
    );
  };

  const hide = (): void => {
    unique.requestHide(id);
  };

  const dismissNow = (): void => {
    unique.dismiss();
  };

  onCleanup(() => {
    unique.requestHide(id, "effectsFast");
  });

  const anchor = () => tooltipAnchorAttrs({ block: props.block, stretch: props.stretch });

  return (
    <span
      ref={(el) => (anchorRef = el)}
      class="yohu-tooltip__anchor"
      data-block={anchor()["data-block"]}
      data-stretch={anchor()["data-stretch"]}
      aria-describedby={unique.session()?.id === id ? tooltipDomId(id) : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusIn={() => {
        if (!tooltipCanShowOnFocus()) return;
        show();
      }}
      onFocusOut={hide}
      onPointerDown={dismissNow}
    >
      {props.children}
    </span>
  );
}
