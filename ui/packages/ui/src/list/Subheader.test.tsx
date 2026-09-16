import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoSubheader } from "./Subheader";

describe("YoSubheader", () => {
  it("默认列表型子标题", () => {
    const { container } = render(() => <YoSubheader title="模块" />);
    expect(screen.getByText("模块")).toBeTruthy();
    expect(container.querySelector(".yohu-subheader")?.getAttribute("data-tone")).toBe("list");
  });

  it("有操作槽才写 data-has-actions", () => {
    const { container } = render(() => (
      <YoSubheader title="设备" actions={<span>刷新</span>} />
    ));
    expect(container.querySelector(".yohu-subheader")?.getAttribute("data-has-actions")).toBe(
      "true",
    );
    expect(screen.getByText("刷新")).toBeTruthy();
  });
});
