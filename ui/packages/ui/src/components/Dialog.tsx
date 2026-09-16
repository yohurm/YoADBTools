/**
 * YoDialog —— 模态对话框（L4 视图 / L5 门面）。
 * HarmonyOS 对照：AdvancedDialog / AlertDialog（API 20+）。
 * 标题居中、内容区必选、操作区 AUTO（L2 center|row|stack → 页脚 data-layout）；
 * 三区之间不画分割线。脚钮对照 AlertDialog：取消/破坏 NORMAL（ghost+accent/danger，灰底+语义字），
 * 建设确认 EMPHASIZED（solid+accent）。禁止脚钮再走 TEXTUAL 透明。
 * 最大宽 400vp；电脑圆角走 YoCorner（role=dialog=16）；
 * 遮罩不点关。禁止面板再用 CSS border + overflow:hidden 画圆角。
 * 开场 spatial（Presence recipe=dialog），关闭淡出后卸节点。
 *
 * 盒：`open` 只是 Presence 开关。fit hug、fill 显式高、exit 锁最后打开盒。
 * fit 外包公开 YoTravel；名单走 YoReveal（open 即接入）。
 * hug 跟 Presence 寿命。关窗冻锁。行程中主槽 clip。
 * 滚条走公开 YoScroller（无法滚动不画条，滑块可拖），不是 travel 配方。
 * 禁止观察 DOM、禁止 hold+rAF、禁止模块自绑行程。
 * fit + overflow=auto 的滚槽预算是 `--yohu-layout-dialog-body-max`。
 * split（bodyLead / bodyTail）钉住铬，只有 YoScroller 视口滚；YoReveal 只进视口。
 * 载荷在 `onExitComplete` 再卸，禁止跟 `onClose` 同拍清。
 *
 * 受控 API：open / title / width / height / bodyLayout / bodyOverflow / bodyPad /
 * bodyLead / bodyTail / initial / onClose / onExitComplete / footer / children。
 *
 * 可达性：
 * - `role=dialog aria-modal`；有标题走 `aria-labelledby`，打开后焦点移入面板
 *   （`initial=footer` 落页脚第一钮；否则首个未 `data-dialog-skip` 的可聚焦）
 * - **焦点陷阱**：Tab/Shift+Tab 在面板内循环，不逃逸到背景
 * - Esc 触发 onClose；关闭后焦点还原到打开前的元素
 * - 遮罩点击不关闭（防误触；仅由显式取消/确认按钮关闭）
 * - 操作区只数页脚 `button` 槽，写成 `data-layout`；CSS 只认 data。skip 是 Dialog 自己的属性，禁止 Chip 等控件代写
 *
 * 多实例叠加：Esc/Tab 由 dialog-stack 单栈裁决。视图只 attach / detach。
 *
 * `open` 支持 `boolean` 或响应式 `Accessor<boolean>`。
 */
import { Show, children, createEffect, createSignal, createUniqueId, onCleanup } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { YoCorner } from "../corner";
import { YoPresence } from "../motion/presence";
import { YoTravel } from "../motion/travel";
import {
  resolveDialogBox,
  resolveDialogInitial,
  type DialogBoxLock,
  type YoDialogBodyLayout,
  type YoDialogBodyOverflow,
  type YoDialogBodyPad,
  type YoDialogInitial,
} from "./dialog-model";
import {
  attachDialog,
  countDialogActions,
  dialogActionsAttrs,
  dialogBodyAttrs,
  dialogExitLock,
  dialogLayerStyle,
  resolveDialogOpen,
  type DialogStackEntry,
} from "./dialog-policy";
import { YoScroller } from "./Scroller";
import "./Dialog.css";

export type { YoDialogBodyLayout, YoDialogBodyOverflow, YoDialogBodyPad, YoDialogInitial };

export interface YoDialogProps {
  /** 是否打开（布尔值或响应式访问器） */
  open: boolean | Accessor<boolean>;
  /** 标题 */
  title?: string;
  /** 面板宽度（px）。不设则走 `--yohu-layout-dialog-max`（弹出框 400）。显式值用于命令管理等整页对话框。 */
  width?: number;
  /** 面板高度（px）；不设则随内容（fit），受 90% 安全顶约束 */
  height?: number;
  /** 内容区排列。默认 stack（纵向 flex）。 */
  bodyLayout?: YoDialogBodyLayout;
  /** 内容区溢出。默认 auto。 */
  bodyOverflow?: YoDialogBodyOverflow;
  /** 内容区垫。默认 lg；整页铺满用 none。 */
  bodyPad?: YoDialogBodyPad;
  /** 滚槽之上的钉住铬（确认文案）。有 lead/tail 才 split。 */
  bodyLead?: JSX.Element;
  /** 滚槽之下的钉住铬（展开/收起）。 */
  bodyTail?: JSX.Element;
  /** 入场首焦。默认 auto；破坏性确认用 footer（取消）。 */
  initial?: YoDialogInitial;
  /** 关闭回调（Esc 触发） */
  onClose: () => void;
  /** Presence 卸节点后。载荷在这里清，禁止跟 onClose 同拍卸。 */
  onExitComplete?: () => void;
  /** 底部按钮区 */
  footer?: JSX.Element;
  children: JSX.Element;
}

/**
 * 渲染一个带遮罩的模态对话框。
 */
export function YoDialog(props: YoDialogProps): JSX.Element {
  const isOpen = (): boolean => resolveDialogOpen(props.open);
  const titleId = createUniqueId();
  const footerKids = children(() => props.footer);

  const [panelEl, setPanelEl] = createSignal<HTMLDivElement | undefined>();
  let lastOpenBox: DialogBoxLock | undefined;

  createEffect(() => {
    if (!isOpen()) return;

    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry: DialogStackEntry = {
      getPanel: () => panelEl(),
      onClose: props.onClose,
      initial: resolveDialogInitial(props.initial),
      restoreFocus,
    };
    const detach = attachDialog(entry);
    onCleanup(detach);
  });

  createEffect(() => {
    const el = panelEl();
    if (!el) return;
    const snap = (): void => {
      const lock = dialogExitLock(el);
      if (lock) lastOpenBox = lock;
    };
    if (isOpen()) snap();
    onCleanup(snap);
  });

  const box = () =>
    resolveDialogBox({
      width: props.width,
      height: props.height,
      open: isOpen(),
      lastOpen: isOpen() ? undefined : lastOpenBox,
    });

  const body = () =>
    dialogBodyAttrs({
      layout: props.bodyLayout,
      overflow: props.bodyOverflow,
      pad: props.bodyPad,
      lead: props.bodyLead != null,
      tail: props.bodyTail != null,
    });

  const footer = () => dialogActionsAttrs(countDialogActions(footerKids.toArray()));

  return (
    <YoPresence
      when={isOpen()}
      recipe="dialog"
      onExitComplete={() => {
        lastOpenBox = undefined;
        props.onExitComplete?.();
      }}
    >
      <div class="yohu-dialog" style={dialogLayerStyle() as JSX.CSSProperties}>
        <div class="yohu-dialog__backdrop" aria-hidden="true" />
        <div
          class="yohu-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={props.title ? titleId : undefined}
          tabindex={-1}
          ref={setPanelEl}
          data-box={box().kind}
          data-sized={box().sized ? "" : undefined}
          style={box().style}
        >
          <YoTravel axes={["block"]} enabled={props.height === undefined && isOpen()}>
            <YoCorner role="dialog" class="yohu-dialog__chrome">
              {props.title ? (
                <h3 id={titleId} class="yohu-dialog__title">
                  {props.title}
                </h3>
              ) : null}
              <div
                class="yohu-dialog__body"
                data-layout={body()["data-layout"]}
                data-overflow={body()["data-overflow"]}
                data-pad={body()["data-pad"]}
                data-region={body()["data-region"]}
              >
                <Show when={body()["data-region"] === "split"} fallback={props.children}>
                  <Show when={props.bodyLead != null}>
                    <div class="yohu-dialog__lead">{props.bodyLead}</div>
                  </Show>
                  <div class="yohu-dialog__scroller">
                    <YoScroller overflow={body()["data-overflow"]}>{props.children}</YoScroller>
                  </div>
                  <Show when={props.bodyTail != null}>
                    <div class="yohu-dialog__tail">{props.bodyTail}</div>
                  </Show>
                </Show>
              </div>
              {props.footer ? (
                <div class="yohu-dialog__footer" data-layout={footer()["data-layout"]}>
                  {footerKids()}
                </div>
              ) : null}
            </YoCorner>
          </YoTravel>
        </div>
      </div>
    </YoPresence>
  );
}
