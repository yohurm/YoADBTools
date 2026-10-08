import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { YoColRow } from "./ColRow";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "ColRow.css"), "utf8");

describe("YoColRow", () => {
  it("写入轨道并承担 row", () => {
    const { container } = render(() => (
      <YoColRow class="yohu-files__cols--head" template="240px 72px minmax(108px, 1fr)">
        <span>名称</span>
      </YoColRow>
    ));
    const row = container.querySelector(".yohu-col-row") as HTMLElement;
    expect(row.getAttribute("role")).toBe("row");
    expect(row.style.gridTemplateColumns).toBe("240px 72px minmax(108px, 1fr)");
    expect(row.classList.contains("yohu-files__cols--head")).toBe(true);
  });

  it("不传 template 时不写内联轨道，交给 --yohu-col-tracks", () => {
    const { container } = render(() => (
      <YoColRow>
        <span>名称</span>
      </YoColRow>
    ));
    const row = container.querySelector(".yohu-col-row") as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe("");
  });

  it("行自己吃列架发布的最小宽与侧轨垫，不点列架 class", () => {
    expect(css).toContain("min-width: var(--yohu-col-row-min, 0)");
    expect(css).toContain("padding-inline-end: var(--yohu-col-gutter-pad, 0)");
    expect(css).toContain("overflow: hidden");
    expect(css).not.toContain(".yohu-col-frame");
  });
});
