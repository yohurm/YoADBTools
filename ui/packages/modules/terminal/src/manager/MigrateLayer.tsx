/**
 * 迁移会话：多选按住拖到其他组，或点「移到」飞过去。
 * 只有一张浮层。跟指针时 left/top 不过渡。
 * 没落到组上：按行错开起步飞回，飞行重叠，最后一张淡出后卸掉浮层。
 * 落到组上：整沓飞到该行，抵达才改草稿。
 * 卸载靠会话计时，不等子节点的 transitionend。减少动效则直接结束。
 */

import { Show, createEffect, createSignal, onCleanup, type Accessor, type JSX } from "solid-js";

import {
  Spacing,
  YoDragPile,
  dismissKey,
  gatherHomeSpan,
  motionSpecMs,
  shouldSkipMotion,
  type DragPilePhase,
} from "@yohu/ui";

import {
  migrateArmed,
  migrateCarry,
  migrateDropId,
  migrateFrontId,
  migrateShouldFly,
  type MigrateCarry,
  type MigratePoint,
} from "./migrate";
import {
  findMigrateEntry,
  findMigrateRow,
  findMigrateSource,
  migrateHitId,
  migrateLocalOrigin,
  migrateLocalPoint,
  readMigrateRoot,
} from "./migrate-place";
import type { CommandManagerStore } from "./store";

type MigratePhase = "carry" | "home" | "drop";

function pilePhase(phase: MigratePhase): DragPilePhase {
  return phase;
}

interface MigrateView {
  phase: MigratePhase;
  at: MigratePoint;
  origin: MigratePoint;
  carry: MigrateCarry;
  origins: readonly MigratePoint[];
  dropAt: MigratePoint | null;
  overId: string | null;
  targetId: string | null;
}

interface PendingPress {
  pointerId: number;
  grabbedId: string;
  fromEl: HTMLElement;
  startX: number;
  startY: number;
}

export interface MigrateApi {
  flyTo: (groupId: string) => void;
}

export function MigrateLayer(props: {
  store: CommandManagerStore;
  root: Accessor<HTMLElement | undefined>;
  onOver: (groupId: string | null) => void;
  /** 拖动、回家、飞向目标时压暗源行。卸掉浮层后松开。 */
  onActive: (active: boolean) => void;
  bind: (api: MigrateApi) => void;
}): JSX.Element {
  const [view, setView] = createSignal<MigrateView | null>(null);
  let pending: PendingPress | null = null;
  let grab = { x: 0, y: 0 };
  let suppressClick = false;
  let landed = false;
  let overlay: HTMLDivElement | undefined;
  let generation = 0;
  let finish = 0;
  let stopMove = (): void => undefined;
  let stopUp = (): void => undefined;
  let stopKey = (): void => undefined;

  const sourceId = (): string | null => props.store.ui.selectedGroupId;

  const cancelFinish = (): void => {
    window.clearTimeout(finish);
    finish = 0;
  };

  const unlisten = (): void => {
    stopMove();
    stopUp();
    stopKey();
    stopMove = () => undefined;
    stopUp = () => undefined;
    stopKey = () => undefined;
  };

  const clearHomeMarks = (): void => {
    props.root()?.querySelectorAll("[data-gather-home]").forEach((el) => el.removeAttribute("data-gather-home"));
  };

  const clear = (): void => {
    generation += 1;
    pending = null;
    landed = false;
    cancelFinish();
    unlisten();
    clearHomeMarks();
    setView(null);
    props.onOver(null);
    props.onActive(false);
  };

  const schedule = (token: number, done: () => void, ms: number): void => {
    cancelFinish();
    finish = window.setTimeout(() => {
      if (token !== generation) return;
      done();
    }, ms);
  };

  const homeBudget = (count: number): number => gatherHomeSpan(count);

  const listen = (): void => {
    const onMove = (event: PointerEvent): void => move(event);
    const onUp = (event: PointerEvent): void => release(event);
    const onKey = (event: KeyboardEvent): void => key(event);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey, true);
    stopMove = () => window.removeEventListener("pointermove", onMove);
    stopUp = () => {
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    stopKey = () => window.removeEventListener("keydown", onKey, true);
  };

  const commit = (groupId: string): void => {
    props.store.moveEntriesTo(groupId);
    clear();
  };

  /** 这次拖放已经结束：条目不再停在选中态。关窗卸载不走这里。 */
  const endGesture = (): void => {
    props.store.selectOnly(null);
    clear();
  };

  const carryOf = (grabbedId: string): MigrateCarry | null =>
    migrateCarry(props.store.selectedEntries(), props.store.selectedEntrySet(), grabbedId);

  const showAt = (
    phase: MigratePhase,
    at: MigratePoint,
    origin: MigratePoint,
    grabbedId: string,
    overId: string | null,
    targetId: string | null,
  ): void => {
    const carry = carryOf(grabbedId);
    if (!carry) return;
    const root = props.root();
    const metrics = root ? readMigrateRoot(root) : null;
    const origins = carry.faces.map((face) => {
      const row = root ? findMigrateEntry(root, face.id) : null;
      if (!row || !metrics) return at;
      return migrateLocalOrigin(metrics, row.getBoundingClientRect());
    });
    setView({
      phase,
      at,
      origin,
      carry,
      origins,
      dropAt: null,
      overId,
      targetId,
    });
    props.onOver(overId);
    props.onActive(true);
  };

  const finishDrop = (): void => {
    const current = view();
    if (!current || current.phase !== "drop" || landed) return;
    landed = true;
    if (current.targetId) commit(current.targetId);
    else endGesture();
  };

  const flyToward = (groupId: string, from: MigratePoint, grabbedId: string): void => {
    const root = props.root();
    const target = root ? findMigrateRow(root, groupId) : null;
    if (!root || !target || shouldSkipMotion()) {
      commit(groupId);
      return;
    }
    landed = false;
    const token = generation;
    showAt("carry", from, from, grabbedId, groupId, groupId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (token !== generation) return;
        const current = view();
        const stack = overlay;
        const liveRoot = props.root();
        const liveTarget = liveRoot ? findMigrateRow(liveRoot, groupId) : null;
        if (!current) return;
        if (!stack || !liveRoot || !liveTarget) {
          commit(groupId);
          return;
        }
        const metrics = readMigrateRoot(liveRoot);
        const dropAt = migrateLocalOrigin(metrics, liveTarget.getBoundingClientRect());
        if (!migrateShouldFly(current.at, dropAt)) {
          commit(groupId);
          return;
        }
        setView({ ...current, phase: "drop", dropAt, targetId: groupId, overId: groupId });
        schedule(token, finishDrop, motionSpecMs("spatialLocal") + motionSpecMs("spatialLocal"));
      });
    });
  };

  const flyTo = (groupId: string): void => {
    if (view() !== null) return;
    const root = props.root();
    const entries = props.store.selectedEntries();
    const selected = props.store.selectedEntrySet();
    const grabbed = migrateFrontId(entries, selected);
    if (!grabbed) return;
    if (!root || shouldSkipMotion()) {
      commit(groupId);
      return;
    }
    const ids = entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);
    const source = findMigrateSource(root, ids);
    if (!source) {
      commit(groupId);
      return;
    }
    const metrics = readMigrateRoot(root);
    const from = migrateLocalOrigin(metrics, source.getBoundingClientRect());
    flyToward(groupId, from, grabbed);
  };

  const move = (event: PointerEvent): void => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const root = props.root();
    if (!root) return;
    const current = view();
    if (!current) {
      if (!migrateArmed({ x: pending.startX, y: pending.startY }, { x: event.clientX, y: event.clientY }, Spacing.Sm)) {
        return;
      }
      const metrics = readMigrateRoot(root);
      const origin = migrateLocalOrigin(metrics, pending.fromEl.getBoundingClientRect());
      const pointer = migrateLocalPoint(metrics, event.clientX, event.clientY);
      grab = { x: pointer.x - origin.x, y: pointer.y - origin.y };
      suppressClick = true;
      landed = false;
      showAt("carry", origin, origin, pending.grabbedId, null, null);
      return;
    }
    if (current.phase !== "carry" || pending === null) return;
    const metrics = readMigrateRoot(root);
    const pointer = migrateLocalPoint(metrics, event.clientX, event.clientY);
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const overId = migrateDropId(props.store.draft.groups, sourceId(), migrateHitId(hit instanceof Element ? hit : null));
    const at = { x: pointer.x - grab.x, y: pointer.y - grab.y };
    setView({ ...current, at, overId });
    props.onOver(overId);
  };

  const beginHome = (current: MigrateView): void => {
    if (shouldSkipMotion()) {
      endGesture();
      return;
    }
    const root = props.root();
    const metrics = root ? readMigrateRoot(root) : null;
    const origins = current.carry.faces.map((face, index) => {
      const row = root ? findMigrateEntry(root, face.id) : null;
      if (!row || !metrics) return current.origins[index] ?? current.at;
      return migrateLocalOrigin(metrics, row.getBoundingClientRect());
    });
    const token = generation;
    props.onOver(null);
    props.onActive(true);
    setView({ ...current, phase: "home", origins, dropAt: null, overId: null });
    schedule(token, endGesture, homeBudget(current.carry.faces.length));
  };

  const release = (event: PointerEvent): void => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    const current = view();
    pending = null;
    unlisten();
    if (!current || current.phase !== "carry") {
      suppressClick = false;
      return;
    }
    if (current.overId) {
      const root = props.root();
      const target = root ? findMigrateRow(root, current.overId) : null;
      if (!root || !target || !overlay || shouldSkipMotion()) {
        commit(current.overId);
        return;
      }
      const dropAt = migrateLocalOrigin(readMigrateRoot(root), target.getBoundingClientRect());
      if (!migrateShouldFly(current.at, dropAt)) {
        commit(current.overId);
        return;
      }
      landed = false;
      const token = generation;
      setView({ ...current, phase: "drop", dropAt, targetId: current.overId });
      schedule(token, finishDrop, motionSpecMs("spatialLocal") + motionSpecMs("spatialLocal"));
      return;
    }
    if (shouldSkipMotion() || !migrateShouldFly(current.at, current.origin)) {
      endGesture();
      return;
    }
    beginHome(current);
  };

  const key = (event: KeyboardEvent): void => {
    if (!dismissKey(event.key)) return;
    const current = view();
    if (!current || current.phase !== "carry") return;
    event.preventDefault();
    event.stopPropagation();
    pending = null;
    unlisten();
    props.onOver(null);
    if (shouldSkipMotion() || !migrateShouldFly(current.at, current.origin)) {
      endGesture();
      return;
    }
    beginHome(current);
  };

  const press = (event: PointerEvent): void => {
    if (pending || view() !== null || event.button !== 0) return;
    if (props.store.selectedEntrySet().size < 2) return;
    const root = props.root();
    if (!root) return;
    if (migrateDestinationsEmpty()) return;
    const node = event.target;
    if (!(node instanceof Element)) return;
    const row = node.closest(".yohu-cm__entries [data-key]");
    if (!(row instanceof HTMLElement)) return;
    const id = row.getAttribute("data-key");
    if (!id || !props.store.selectedEntrySet().has(id)) return;
    pending = {
      pointerId: event.pointerId,
      grabbedId: id,
      fromEl: row,
      startX: event.clientX,
      startY: event.clientY,
    };
    listen();
  };

  function migrateDestinationsEmpty(): boolean {
    const id = sourceId();
    if (!id) return true;
    return props.store.draft.groups.every((group) => group.id === id);
  }

  const onClick = (event: MouseEvent): void => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const onArrive = (id: string): void => {
    const root = props.root();
    const row = root ? findMigrateEntry(root, id) : null;
    row?.setAttribute("data-gather-home", "");
  };

  const onPileDone = (): void => {
    const current = view();
    if (!current) return;
    if (current.phase === "drop") finishDrop();
    else endGesture();
  };

  createEffect(() => {
    props.bind({ flyTo });
  });

  createEffect(() => {
    const el = props.root();
    if (!el) return;
    const down = (event: PointerEvent): void => press(event);
    const click = (event: MouseEvent): void => onClick(event);
    el.addEventListener("pointerdown", down);
    el.addEventListener("click", click, true);
    onCleanup(() => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("click", click, true);
    });
  });

  createEffect(() => {
    if (!props.store.ui.open) clear();
  });

  onCleanup(() => clear());

  return (
    <Show when={view()}>
      {(current) => (
        <div
          ref={(el) => {
            overlay = el;
          }}
          class="yohu-cm-migrate"
          data-ready=""
          data-open=""
        >
          <YoDragPile
            faces={current().carry.faces}
            count={current().carry.count}
            phase={pilePhase(current().phase)}
            origins={current().origins}
            stack={current().at}
            dropAt={current().dropAt ?? undefined}
            onArrive={onArrive}
            onDone={onPileDone}
          />
        </div>
      )}
    </Show>
  );
}
