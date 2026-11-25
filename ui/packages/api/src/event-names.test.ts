import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EVENT_NAMES } from "./types";

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../testdata/event_names.json",
);

describe("EVENT_NAMES（事件名契约孪生）", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, string>;

  it("与 yohu_protocol::event_names 共享 fixture 深等（键值一一且键数一致）", () => {
    expect(EVENT_NAMES).toEqual(fixture);
    expect(Object.keys(EVENT_NAMES).length).toBe(Object.keys(fixture).length);
  });

  it("事件名不含点号（Tauri 2.9 emit/listen 约束）", () => {
    for (const name of Object.values(EVENT_NAMES)) {
      expect(name).not.toContain(".");
    }
  });
});
