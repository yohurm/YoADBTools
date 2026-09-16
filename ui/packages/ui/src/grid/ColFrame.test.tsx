import { render } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { YoColCell } from "./ColCell";
import { YoColFrame } from "./ColFrame";
import { YoColRow } from "./ColRow";
import { YoColTrack } from "./ColTrack";

describe("YoColFrame", () => {
  it("只写一次轨道与列垫，表头和行都不内联 template", () => {
    const { container } = render(() => (
      <YoColFrame template="80px minmax(96px, 1fr)">
        <YoColRow>
          <span>时间</span>
        </YoColRow>
        <YoColTrack>
          <YoColCell>09-10</YoColCell>
        </YoColTrack>
      </YoColFrame>
    ));
    const frame = container.querySelector(".yohu-col-frame") as HTMLElement;
    expect(frame.style.getPropertyValue("--yohu-col-tracks")).toBe("80px minmax(96px, 1fr)");
    expect(container.querySelector(".yohu-col-row")?.getAttribute("style") ?? "").not.toContain(
      "grid-template-columns",
    );
    expect(container.querySelector(".yohu-col-track")?.getAttribute("style") ?? "").not.toContain(
      "grid-template-columns",
    );
    expect(container.querySelector(".yohu-col-cell")).not.toBeNull();
    expect(frame.getAttribute("data-cell-pad")).toBe("list");
  });

  it("文档列表 cellPad=none 关掉列垫", () => {
    const { container } = render(() => (
      <YoColFrame template="20ch minmax(12ch, 1fr)" cellPad="none">
        <YoColRow>
          <span>时间</span>
        </YoColRow>
      </YoColFrame>
    ));
    const frame = container.querySelector(".yohu-col-frame") as HTMLElement;
    expect(frame.getAttribute("data-cell-pad")).toBe("none");
    expect(frame.style.getPropertyValue("--yohu-col-tracks")).toBe("20ch minmax(12ch, 1fr)");
  });
});
