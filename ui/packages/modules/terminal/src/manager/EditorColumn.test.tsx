import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

import { EditorColumn } from "./EditorColumn";
import { createCommandManagerStore } from "./store";

const sample: CommandLibraryDto = {
  schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
  groups: [
    {
      id: "g1",
      name: "设备信息",
      entries: [
        { kind: "command", id: "c1", name: "型号", template: "shell getprop {0}", params: [{ index: 0, description: "属性名" }] },
        { kind: "command", id: "c2", name: "电量", template: "shell dumpsys battery" },
        {
          kind: "block",
          id: "b1",
          name: "连上再看",
          gap_ms: 200,
          steps: [{ template: "wait-for-device" }, { template: "shell getprop {0}" }],
        },
      ],
    },
  ],
};

describe("EditorColumn 选区", () => {
  it("从空态跟到组、命令、块，不停留空文案", () => {
    const store = createCommandManagerStore();
    render(() => <EditorColumn store={store} />);
    expect(screen.getByText("选择左侧命令组，或新建一组")).toBeTruthy();

    store.load(sample);
    expect(screen.getByLabelText("组名称")).toBeTruthy();
    expect(screen.queryByText("选择左侧命令组，或新建一组")).toBeNull();

    store.selectEntry("c1", "replace");
    expect(screen.getByLabelText("命令名称")).toBeTruthy();
    expect(screen.getByLabelText(/具体命令/)).toBeTruthy();
    expect(screen.getByLabelText("{0}")).toBeTruthy();
    expect(screen.queryByLabelText("组名称")).toBeNull();
    const labels = [...document.querySelectorAll(".yohu-cm__editor .yohu-text-field__label")].map(
      (node) => node.textContent,
    );
    expect(labels[0]).toBe("命令名称");
    expect(labels[1]).toMatch(/^具体命令/);
    expect(labels[2]).toBe("{0}");

    store.selectEntry("b1", "replace");
    expect(screen.getByLabelText("命令块名称")).toBeTruthy();
    expect(screen.queryByLabelText("命令名称")).toBeNull();

    store.selectEntry("c1", "toggle");
    expect(screen.getByText("已选 2 条")).toBeTruthy();
  });
});
