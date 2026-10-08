import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";

import { YoDragPile } from "./DragPile";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "DragPile.css"), "utf8");
const src = readFileSync(resolve(here, "DragPile.tsx"), "utf8");

describe("YoDragPile", () => {
  it("一条是白牌，不扇开、不画角标", () => {
    const { container } = render(() => (
      <YoDragPile
        faces={[{ id: "a", label: "型号", leading: "terminal" }]}
        count={1}
        origins={[{ x: 0, y: 0 }]}
        stack={{ x: 0, y: 0 }}
      />
    ));
    const host = container.querySelector(".yohu-drag-pile");
    const plate = container.querySelector(".yohu-drag-pile__plate");
    expect(host?.getAttribute("data-phase")).toBe("carry");
    expect(plate?.getAttribute("style")).toContain("scale(1.05)");
    expect(container.querySelectorAll(".yohu-drag-pile__plate")).toHaveLength(1);
    expect(container.querySelector("[data-back]")).toBeNull();
    expect(container.querySelector(".yohu-drag-pile__badge")).toBeNull();
    expect(container.querySelector(".yohu-drag-pile__label")?.textContent).toBe("型号");
  });

  it("每条选中项都有自己的牌，前三张扇开，其余先透明", () => {
    const { container } = render(() => (
      <YoDragPile
        faces={[
          { id: "serial", label: "设备序列号", leading: "block" },
          { id: "android", label: "Android版本", leading: "terminal" },
          { id: "model", label: "型号", leading: "terminal" },
          { id: "extra", label: "电源", leading: "terminal" },
        ]}
        count={4}
        phase="carry"
        origins={[
          { x: 0, y: 30 },
          { x: 0, y: 0 },
          { x: 0, y: 60 },
          { x: 0, y: 90 },
        ]}
        stack={{ x: 40, y: 10 }}
      />
    ));
    const host = container.querySelector(".yohu-drag-pile");
    const plates = container.querySelectorAll(".yohu-drag-pile__plate");
    expect(host?.getAttribute("data-phase")).toBe("carry");
    expect(host?.getAttribute("data-recipe")).toBe("gather");
    expect(plates).toHaveLength(4);
    expect(container.querySelectorAll("[data-back]")).toHaveLength(3);
    expect(plates[0]?.getAttribute("style")).toContain("scale(1.05)");
    expect(plates[1]?.getAttribute("style")).toContain("rotate(8deg)");
    expect(plates[1]?.getAttribute("style")).toContain("opacity: 0.6");
    expect(plates[1]?.textContent).toContain("Android版本");
    expect(plates[2]?.getAttribute("style")).toContain("rotate(-8deg)");
    expect(plates[3]?.getAttribute("style")).toContain("opacity: 0");
    expect(plates[3]?.textContent).toContain("电源");
    expect(plates[1]?.getAttribute("style")).toContain("top: 0px");
    expect(container.querySelector(".yohu-drag-pile__badge")?.textContent).toBe("4");
    expect(container.querySelector("[data-return-last]")).toBeNull();
  });

  it("每张牌的布局盒钉在自己的行上", () => {
    const { container } = render(() => (
      <YoDragPile
        faces={[
          { id: "model", label: "型号", leading: "terminal" },
          { id: "android", label: "Android版本", leading: "terminal" },
        ]}
        count={2}
        phase="carry"
        origins={[
          { x: 4, y: 8 },
          { x: 12, y: 20 },
        ]}
        stack={{ x: 4, y: 8 }}
      />
    ));
    const plates = container.querySelectorAll(".yohu-drag-pile__plate");
    expect(plates[0]?.getAttribute("data-face")).toBe("model");
    expect(plates[0]?.getAttribute("style")).toContain("left: 4px");
    expect(plates[0]?.getAttribute("style")).toContain("top: 8px");
    expect(plates[1]?.getAttribute("data-face")).toBe("android");
    expect(plates[1]?.getAttribute("style")).toContain("left: 12px");
    expect(plates[1]?.getAttribute("style")).toContain("top: 20px");
  });

  it("牌面是 surface，不走选中洗色，也不再错位叠成细线", () => {
    expect(css).toContain("--yohu-corner-fill: var(--yohu-surface)");
    expect(css).not.toContain("accent-soft");
    expect(css).not.toContain("translate");
    expect(css).not.toContain("scale(1.04)");
    expect(css).not.toContain("scale(0.82)");
    expect(src).not.toContain("<YoChip");
    expect(src).not.toContain("<YoBadge");
    expect(src).not.toContain('from "./Chip"');
    expect(src).not.toContain('from "./Badge"');
    expect(src).not.toContain("accent-soft");
  });
});
