import { describe, expect, it } from "vitest";

import { vi } from "vitest";

import { motionSpecMs } from "../tokens/motion";
import {
  gatherDropTransform,
  gatherHomeSpan,
  gatherHomeTransform,
  gatherReleaseOrder,
  gatherReleaseStartMs,
  gatherStackTransform,
  playGatherRelease,
} from "./gather-release";

vi.mock("../motion/reduced", () => ({
  shouldSkipMotion: () => false,
}));

describe("gather-release", () => {
  it("松开顺序按行从上到下，同一行再从左到右", () => {
    expect(
      gatherReleaseOrder([
        { index: 0, originX: 10, originY: 80 },
        { index: 1, originX: 10, originY: 20 },
        { index: 2, originX: 4, originY: 20 },
        { index: 3, originX: 10, originY: 48 },
      ]),
    ).toEqual([2, 1, 3, 0]);
  });

  it("跟指针是相对自己行的平移，回家时平移归零", () => {
    expect(gatherStackTransform({ x: 12, y: 40 }, { x: 80, y: 16 }, 8, 1.05)).toBe(
      "translate(68px, -24px) rotate(8deg) scale(1.05)",
    );
    expect(gatherHomeTransform()).toBe("translate(0px, 0px) rotate(0deg) scale(1)");
    expect(gatherDropTransform({ x: 12, y: 40 }, { x: 4, y: 8 })).toBe(
      "translate(-8px, -32px) rotate(0deg) scale(1)",
    );
  });

  it("错开起步，下一张不等上一张飞完", async () => {
    const step = motionSpecMs("effectsFast");
    expect(gatherReleaseStartMs(0)).toBe(0);
    expect(gatherReleaseStartMs(2)).toBe(step * 2);
    expect(gatherHomeSpan(3)).toBe(step * 2 + motionSpecMs("spatialLocal") + motionSpecMs("effectsExit"));

    const started: number[] = [];
    const pending: Array<() => void> = [];
    const plates = [80, 20, 48].map((y, index) => {
      const el = document.createElement("div");
      el.style.transform = "translate(4px, 4px)";
      el.style.opacity = "1";
      el.animate = ((_: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) => {
        const delay = typeof options === "object" && options ? Number(options.delay ?? 0) : 0;
        const duration = typeof options === "object" && options ? Number(options.duration ?? 0) : 0;
        if (duration > 0) started.push(delay);
        let finish = (): void => undefined;
        const finished = new Promise<Animation>((resolve) => {
          finish = () => resolve({} as Animation);
        });
        pending.push(finish);
        return { finished, cancel: finish } as unknown as Animation;
      }) as typeof el.animate;
      return { el, id: `c${index}`, originX: 0, originY: y };
    });

    const flying = playGatherRelease({ plates, mode: "home" });
    await Promise.resolve();
    expect(started).toEqual([0, step, step * 2]);
    for (let guard = 0; guard < 8; guard += 1) {
      const batch = pending.splice(0, pending.length);
      for (const finish of batch) finish();
      await Promise.resolve();
      await Promise.resolve();
    }
    await flying;
  });
});
