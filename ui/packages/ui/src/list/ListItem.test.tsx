import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { YoListItem } from "./ListItem";

describe("YoListItem", () => {
  it("默认 option 行，选中写 aria-selected", () => {
    const { container } = render(() => (
      <YoListItem title="edge 60" description="SERIAL" selected />
    ));
    const row = container.querySelector(".yohu-list-item");
    expect(row?.getAttribute("role")).toBe("option");
    expect(row?.getAttribute("aria-selected")).toBe("true");
    expect(row?.classList.contains("yohu-interactive--selected")).toBe(true);
    expect(screen.getByText("SERIAL")).toBeTruthy();
    expect(container.querySelector(".yohu-list-item__extra")).toBeTruthy();
    expect(container.querySelector(".yohu-list-item__description")?.textContent).toBe("SERIAL");
  });

  it("导航钮走 aria-current，不写 aria-selected", () => {
    const onClick = vi.fn();
    render(() => (
      <YoListItem role="button" title="终端" current selected ring="inset" onClick={onClick} />
    ));
    const btn = screen.getByRole("button", { name: "终端" });
    expect(btn.getAttribute("aria-current")).toBe("page");
    expect(btn.hasAttribute("aria-selected")).toBe(false);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
