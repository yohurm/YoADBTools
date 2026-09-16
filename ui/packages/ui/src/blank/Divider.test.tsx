import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoDivider } from "./Divider";

describe("YoDivider", () => {
  it("默认横线", () => {
    const { container } = render(() => <YoDivider />);
    const rule = container.querySelector(".yohu-divider");
    expect(rule?.tagName).toBe("HR");
    expect(rule?.getAttribute("data-orientation")).toBe("horizontal");
  });

  it("可竖切", () => {
    const { container } = render(() => <YoDivider orientation="vertical" />);
    expect(container.querySelector(".yohu-divider")?.getAttribute("data-orientation")).toBe(
      "vertical",
    );
  });
});
