import { describe, expect, it } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { YoDescriptionList } from "./DescriptionList";

describe("YoDescriptionList", () => {
  it("画 term/detail，空 term 不进表", () => {
    render(() => (
      <YoDescriptionList
        items={[
          { term: "类型", detail: "文件" },
          { term: "   ", detail: "丢" },
          { term: "大小", detail: "12 B" },
        ]}
      />
    ));
    expect(screen.getByText("类型")).toBeTruthy();
    expect(screen.getByText("文件")).toBeTruthy();
    expect(screen.getByText("12 B")).toBeTruthy();
    expect(screen.queryByText("丢")).toBeNull();
  });
});
