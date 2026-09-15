/**
 * YoDialog —— 模态对话框（L4 视图 / L5 门面）。
 * HarmonyOS 对照：弹出框；最大宽 400vp；遮罩 10% 中性，不点遮罩关闭。
 * 开场 spatial（Presence recipe=dialog），关闭淡出后卸节点。
 * `open` 只是 Presence 开关，不是载荷是否为空。出场锁最后一次打开盒，
 * hug 不随 Collapse / 名单卸掉折高；载荷在 `onExitComplete` 再卸。
 * 受控 API：open / title / width / height / bodyLayout / bodyOverflow / bodyPad / initial / onClose / onExitComplete / footer / children。
 *
 * 可达性：
 * - `role=dialog aria-modal`；有标题走 `aria-labelledby`，打开后焦点移入面板
 *   （`initial=footer` 落页脚第一钮；否则首个未 `data-dialog-skip` 的可聚焦）
 * - **焦点陷阱**：Tab/Shift+Tab 在面板内循环，不逃逸到背景
 * - Esc 触发 onClose；关闭后焦点还原到打开前的元素
 * - 遮罩点击不关闭（防误触；仅由显式取消/确认按钮关闭）
 *
 * 多实例叠加：Esc/Tab 由 dialog-stack 单栈裁决。视图只 attach / detach。
 *
 * `open` 支持 `boolean` 或响应式 `Accessor<boolean>`。
 */
import { createEffect, createSignal, createUniqueId, onCleanup } from "solid-js";
import type { Accessor, JSX } from "solid-js";
import { YoPresence } from "../motion/presence";
import {
  dialogPanelPaint,
  mergeDialogPanelStyle,
  resolveDialogInitial,
  type DialogExitLock,
  type YoDialogBodyLayout,
  type YoDialogBodyOverflow,
  type YoDialogBodyPad,
  type YoDialogInitial,
} from "./dialog-model";
import {
  attachDialog,
  dialogBodyAttrs,
  dialogExitLock,
  dialogLayerStyle,
  resolveDialogOpen,
  type DialogStackEntry,
} from "./dialog-policy";
import "./Dialog.css";

export type { YoDialogBodyLayout, YoDialogBodyOverflow, YoDialogBodyPad, YoDialogInitial };

export interface YoDialogProps {
  /** 是否打开（布尔值或响应式访问器） */
  open: boolean | Accessor<boolean>;
  /** 标题 */
  title?: string;
  /** 面板宽度（px）。不设则走 `--yohu-layout-dialog-max`（弹出框 400）。显式值用于命令管理等整页对话框。 */
  width?: number;
  /** 面板高度（px）；不设则随内容，受 max-height 约束 */
  height?: number;
  /** 内容区排列。默认 stack（纵向 flex）。 */
  bodyLayout?: YoDialogBodyLayout;
  /** 内容区溢出。默认 auto。 */
  bodyOverflow?: YoDialogBodyOverflow;
  /** 内容区垫。默认 lg；整页铺满用 none。 */
  bodyPad?: YoDialogBodyPad;
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

  const [panelEl, setPanelEl] = createSignal<HTMLDivElement | undefined>();
  const [exitLock, setExitLock] = createSignal<DialogExitLock | undefined>();
  let lastOpenBox: DialogExitLock | undefined;

  createEffect(() => {
    if (!isOpen()) return;

    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const entry: DialogStackEntry = {
      getPanel: () => panelEl(),
      onClose: props.onClose,
      restoreFocus,
      initial: resolveDialogInitial(props.initial),
    };
    const detach = attachDialog(entry);
    onCleanup(detach);
  });

  createEffect(() => {
    if (!isOpen()) {
      setExitLock(lastOpenBox);
      return;
    }
    setExitLock(undefined);
    const el = panelEl();
    if (!el) return;
    const sync = (): void => {
      const lock = dialogExitLock(el);
      if (lock) lastOpenBox = lock;
    };
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  const paint = (): ReturnType<typeof dialogPanelPaint> => dialogPanelPaint(props.width, props.height);
  const body = (): ReturnType<typeof dialogBodyAttrs> =>
    dialogBodyAttrs({
      layout: props.bodyLayout,
      overflow: props.bodyOverflow,
      pad: props.bodyPad,
    });

  return (
    <YoPresence
      when={isOpen()}
      recipe="dialog"
      onExitComplete={() => {
        lastOpenBox = undefined;
        setExitLock(undefined);
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
          data-sized={paint().sized ? "" : undefined}
          data-fill={paint().fill ? "" : undefined}
          data-exit-lock={exitLock() ? "" : undefined}
          style={mergeDialogPanelStyle(paint(), exitLock())}
        >
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
          >
            {props.children}
          </div>
          {props.footer ? <div class="yohu-dialog__footer">{props.footer}</div> : null}
        </div>
      </div>
    </YoPresence>
  );
}
