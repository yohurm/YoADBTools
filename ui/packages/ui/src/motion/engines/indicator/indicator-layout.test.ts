import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  EMPTY_INDICATOR,
  indicatorDurationName,
  indicatorReady,
  indicatorVariantIsFill,
  indicatorVariantIsUnderline,
  measureIndicator,
} from "./indicator-layout";

function rect(left: number, top: number, width: number, height: number): DOMRectReadOnly {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("indicator-layout", () => {
  it("选择块相对 track 原点", () => {
    const box = measureIndicator(rect(100, 40, 200, 32), rect(164, 44, 68, 24));
    expect(box).toEqual({ x: 64, y: 4, width: 68, height: 24 });
    expect(indicatorReady(box)).toBe(true);
  });

  it("滚动容器把可视距折成内容坐标", () => {
    const box = measureIndicator(rect(0, 80, 240, 120), rect(8, 40, 224, 32), { left: 0, top: 64 });
    expect(box).toEqual({ x: 8, y: 24, width: 224, height: 32 });
  });

  it("空盒未就绪，避免首帧闪缩", () => {
    expect(indicatorReady(EMPTY_INDICATOR)).toBe(false);
  });

  it("按行程挑时长档：短跳 fast、邻项 small、跨栏 local", () => {
    const origin = { x: 0, y: 0, width: 80, height: 32 };
    expect(indicatorDurationName(origin, { ...origin, y: 24 })).toBe("fast");
    expect(indicatorDurationName(origin, { ...origin, y: 32 })).toBe("small");
    expect(indicatorDurationName(origin, { ...origin, y: 96 })).toBe("small");
    expect(indicatorDurationName(origin, { ...origin, y: 128 })).toBe("local");
  });

  it("下划线只判一次", () => {
    expect(indicatorVariantIsUnderline("underline")).toBe(true);
    expect(indicatorVariantIsUnderline("fill")).toBe(false);
    expect(indicatorVariantIsUnderline("thumb")).toBe(false);
    expect(indicatorVariantIsFill("fill")).toBe(true);
    expect(indicatorVariantIsFill("underline")).toBe(false);
    expect(indicatorVariantIsFill("thumb")).toBe(false);
  });
});

describe("指示条变体只在布局判定", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("视图不再比较 underline / fill / thumb", () => {
    for (const name of ["indicator-layout.ts", "indicator.tsx"]) {
      let body = readFileSync(join(root, name), "utf8");
      body = body.replaceAll('return variant === "underline"', "");
      body = body.replaceAll('return variant === "fill"', "");
      expect(body, name).not.toContain('variant === "underline"');
      expect(body, name).not.toContain('variant === "fill"');
      expect(body, name).not.toContain('variant() !== "fill"');
      expect(body, name).not.toContain('variant === "thumb"');
    }
  });
});

describe("指示条过渡监听成对登记", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("transitionrun 与 transitionend 走同一 listen", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("add" + "EventListener")).toBe(2);
    expect(times("remove" + "EventListener")).toBe(2);
    expect(times(", true)")).toBe(2);
    expect(times("addEventListener(\"transition" + "run\"")).toBe(0);
    expect(times("addEventListener(\"transition" + "end\"")).toBe(0);
    expect(times("removeEventListener(\"transition" + "run\"")).toBe(0);
    expect(times("removeEventListener(\"transition" + "end\"")).toBe(0);
    expect(body).toContain('listen("transitionrun")');
    expect(body).toContain('listen("transitionend")');
  });

  it("回调只排版时直接登记 layout", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("() => " + "layout()")).toBe(0);
    expect(times("new ResizeObserver(" + "layout)")).toBe(1);
    expect(times("onTransition, " + "true")).toBe(0);
    expect(times("layout, " + "true")).toBe(2);
  });
});

describe("指示盒边", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("宽高必填边长不小于 0", () => {
    const body = readFileSync(join(root, "indicator-layout.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("Math.max(0, " + "item.width)")).toBe(0);
    expect(times("Math.max(0, " + "item.height)")).toBe(0);
    expect(body).toContain("indicatorExtent(item.width)");
    expect(body).toContain("indicatorExtent(item.height)");
    expect(times("return Math.max(0, value)")).toBe(1);
    expect(times("function indicatorExtent")).toBe(1);
  });
});

describe("指示内容轴", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("横纵都是目标边减轨道边再加上滚动", () => {
    const body = readFileSync(join(root, "indicator-layout.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("item.left - track.left + " + "scroll.left")).toBe(0);
    expect(times("item.top - track.top + " + "scroll.top")).toBe(0);
    expect(body).toContain("indicatorAxis(item.left, track.left, scroll.left)");
    expect(body).toContain("indicatorAxis(item.top, track.top, scroll.top)");
    expect(times("function indicatorAxis")).toBe(1);
    expect(times("return itemEdge - trackEdge + scroll")).toBe(1);
    expect(body).toContain("indicatorExtent(item.width)");
    expect(body).toContain("function indicatorExtent");
    expect(body).toContain("indicatorDelta(to.x, from.x)");
  });
});

describe("指示轴位移", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("横纵都是终点减去起点", () => {
    const body = readFileSync(join(root, "indicator-layout.ts"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("to.x - " + "from.x")).toBe(0);
    expect(times("to.y - " + "from.y")).toBe(0);
    expect(body).toContain("indicatorDelta(to.x, from.x)");
    expect(body).toContain("indicatorDelta(to.y, from.y)");
    expect(times("function indicatorDelta")).toBe(1);
    expect(times("return to - from")).toBe(1);
    expect(body).toContain("function indicatorAxis");
    expect(body).toContain("indicatorAxis(item.left, track.left, scroll.left)");
    expect(body).toContain("indicatorOpen(box.width)");
  });
});

describe("指示盒展开", () => {
  it("宽和高都大于 0", () => {
    const body = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "indicator-layout.ts"),
      "utf8",
    );
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("box.width > " + "0")).toBe(0);
    expect(times("box.height > " + "0")).toBe(0);
    expect(body).toContain("indicatorOpen(box.width)");
    expect(body).toContain("indicatorOpen(box.height)");
    expect(times("function indicatorOpen")).toBe(1);
    expect(times("return value > 0")).toBe(1);
    expect(body).toContain("function indicatorDelta");
    expect(body).toContain("indicatorDelta(to.x, from.x)");
    expect(times("return Math.max(0, value)")).toBe(1);
  });
});

describe("指示长度像素", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("宽高与坐标都写成 CSS 像素", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("${box.width}" + "px")).toBe(0);
    expect(times("${box.height}" + "px")).toBe(0);
    expect(times("${box.x}" + "px")).toBe(0);
    expect(times("${box.y}" + "px")).toBe(0);
    expect(times("function indicatorCssPx")).toBe(1);
    expect(times("export function indicatorCssPx")).toBe(0);
    expect(times("return `${" + "value}px`")).toBe(1);
    expect(times("indicatorCssPx(box.width)")).toBe(2);
    expect(times("indicatorCssPx(box.x)")).toBe(2);
    expect(times("indicatorCssPx(box.height)")).toBe(1);
    expect(times("indicatorCssPx(box.y)")).toBe(1);
    expect(body).toContain("var(--yohu-dur-");
    expect(times("add" + "EventListener")).toBe(2);
  });
});

describe("指示观察尺寸", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("项与轨都交给 indicatorObserve", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("observer.observe(" + "item)")).toBe(0);
    expect(times("trackRo.observe(" + "track)")).toBe(0);
    expect(times("function indicatorObserve")).toBe(1);
    expect(times("export function indicatorObserve")).toBe(0);
    expect(times("new ResizeObserver(layout)")).toBe(1);
    expect(times("observer.observe(target)")).toBe(1);
    expect(times("indicatorObserve(item, layout)")).toBe(1);
    expect(times("indicatorObserve(track, layout)")).toBe(1);
    expect(body).toContain("function indicatorCssPx");
    expect(times("indicatorCssPx(box.width)")).toBe(2);
    expect(times("add" + "EventListener")).toBe(2);
  });
});

describe("指示能观察尺寸", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("两处判断都问能否观察", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("typeof ResizeObserver === " + "\"undefined\"")).toBe(0);
    expect(times("typeof ResizeObserver !== " + "\"undefined\"")).toBe(1);
    expect(times("function indicatorCanObserve")).toBe(1);
    expect(times("export function indicatorCanObserve")).toBe(0);
    expect(times("!indicatorCanObserve()")).toBe(1);
    expect(times("if (indicatorCanObserve())")).toBe(1);
    expect(times("indicatorCanObserve()")).toBe(3);
    expect(body).toContain("function indicatorObserve");
    expect(times("indicatorObserve(item, layout)")).toBe(1);
    expect(times("indicatorObserve(track, layout)")).toBe(1);
    expect(times("new ResizeObserver(layout)")).toBe(1);
  });
});

describe("指示查找选中项", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("三处查找都走 indicatorSelected", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("querySelector<HTMLElement>(" + "selector())")).toBe(0);
    expect(times("function indicatorSelected")).toBe(1);
    expect(times("export function indicatorSelected")).toBe(0);
    expect(times("querySelector<HTMLElement>(selector)")).toBe(1);
    expect(times("indicatorSelected(track, selector())")).toBe(2);
    expect(times("indicatorSelected(trackOf(), selector())")).toBe(1);
    expect(body).toContain("function indicatorCanObserve");
    expect(times("indicatorCanObserve()")).toBe(3);
    expect(times("!indicatorCanObserve()")).toBe(1);
    expect(times("indicatorObserve(item, layout)")).toBe(1);
  });
});

describe("指示停下移动", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("两处停下都走 indicatorClearMoving", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("setMoving(" + "false)")).toBe(1);
    expect(times("function indicatorClearMoving")).toBe(1);
    expect(times("export function indicatorClearMoving")).toBe(0);
    expect(times("indicatorClearMoving(setMoving)")).toBe(2);
    expect(times("setMoving(" + "true)")).toBe(1);
    expect(times("moveGen += 1")).toBe(1);
    expect(times("++moveGen")).toBe(1);
    expect(body).toContain("function indicatorSelected");
    expect(times("indicatorSelected(track, selector())")).toBe(2);
    expect(times("querySelector<HTMLElement>(selector)")).toBe(1);
  });
});

describe("指示没有跟随", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("两处判断都走 indicatorFollowMissing", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("props.follow == " + "null")).toBe(0);
    expect(times("function indicatorFollowMissing")).toBe(1);
    expect(times("export function indicatorFollowMissing")).toBe(0);
    expect(times("return follow == null")).toBe(1);
    expect(times("indicatorFollowMissing(props.follow)")).toBe(2);
    expect(times("function indicatorClearMoving")).toBe(1);
    expect(times("indicatorClearMoving(setMoving)")).toBe(2);
    expect(times("setMoving(" + "false)")).toBe(1);
    expect(times("setMoving(" + "true)")).toBe(1);
    expect(times("moveGen += 1")).toBe(1);
    expect(times("++moveGen")).toBe(1);
  });
});

describe("指示登记下一帧", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("两处登记都走 indicatorNextFrame", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("requestAnimationFrame(" + "() =>")).toBe(0);
    expect(times("function indicatorNextFrame")).toBe(1);
    expect(times("export function indicatorNextFrame")).toBe(0);
    expect(times("return requestAnimationFrame(run)")).toBe(1);
    expect(times("indicatorNextFrame(() =>")).toBe(2);
    expect(times("window." + "requestAnimationFrame")).toBe(0);
    expect(body).toContain("function indicatorFollowMissing");
    expect(times("indicatorFollowMissing(props.follow)")).toBe(2);
    expect(times("return follow == null")).toBe(1);
    expect(times("props.follow == " + "null")).toBe(0);
  });
});

describe("指示量客户区", () => {
  const root = dirname(fileURLToPath(import.meta.url));

  it("两处客户区都走 indicatorRect", () => {
    const body = readFileSync(join(root, "indicator.tsx"), "utf8");
    const times = (needle: string): number => body.split(needle).length - 1;
    expect(times("track.getBoundingClientRect(" + ")")).toBe(0);
    expect(times("item.getBoundingClientRect(" + ")")).toBe(0);
    expect(times("function indicatorRect")).toBe(1);
    expect(times("export function indicatorRect")).toBe(0);
    expect(times("el.getBoundingClientRect()")).toBe(1);
    expect(times("indicatorRect(track)")).toBe(1);
    expect(times("indicatorRect(item)")).toBe(1);
    expect(times("track.scrollLeft")).toBe(1);
    expect(times("track.scrollTop")).toBe(1);
    expect(body).toContain("function indicatorNextFrame");
    expect(times("indicatorNextFrame(() =>")).toBe(2);
    expect(times("return requestAnimationFrame(run)")).toBe(1);
  });
});
