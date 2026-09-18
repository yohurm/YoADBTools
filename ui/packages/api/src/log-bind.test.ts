import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { ProcessEntry } from "./types";
import {
  emptyBinding,
  pidSetOf,
  rebindPids,
  toWireFilter,
  type PidBinding,
} from "./log-bind";

const testdata = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../core/yohu-domain/testdata/log_bind.json",
);

type Fixture = {
  rebind: {
    prev: PidBinding;
    index: ProcessEntry[];
    pkg: string;
    include_child: boolean;
    current: number[];
    history: number[];
    pid_set: number[];
  }[];
  history_cap: {
    cap: number;
    pids: number[];
    pkg: string;
    pid_set_len: number;
    current0: number;
  };
  wire: {
    levels: string[];
    tag_contains: string;
    keyword: string;
    scope: { kind: "all" } | { kind: "pid"; pid: number } | { kind: "package" };
    pid_set: number[];
    expect?: Record<string, unknown>;
    omit_tag?: boolean;
    expect_tag?: string;
    expect_message?: string;
  }[];
};

const fixture = JSON.parse(readFileSync(testdata, "utf8")) as Fixture;

describe("log-bind（与 domain testdata/log_bind.json 同一套向量）", () => {
  it.each(fixture.rebind)("rebind $pkg child=$include_child", (c) => {
    const got = rebindPids(c.prev, c.index, c.pkg, c.include_child);
    expect(got.current).toEqual(c.current);
    expect(got.history).toEqual(c.history);
    expect(pidSetOf(got)).toEqual(c.pid_set);
  });

  it("history cap", () => {
    const c = fixture.history_cap;
    let binding = emptyBinding();
    for (const pid of c.pids) {
      binding = rebindPids(binding, [{ pid, name: c.pkg }], c.pkg, false, c.cap);
    }
    const set = pidSetOf(binding);
    expect(set).toHaveLength(c.pid_set_len);
    expect(set[0]).toBe(c.current0);
  });

  it.each(fixture.wire)("wire $scope.kind", (c) => {
    const got = toWireFilter({
      levels: c.levels,
      tagContains: c.tag_contains,
      keyword: c.keyword,
      scope: c.scope,
      pidSet: c.pid_set,
    });
    if (c.expect) {
      for (const [key, value] of Object.entries(c.expect)) {
        expect((got as unknown as Record<string, unknown>)[key]).toEqual(value);
      }
    }
    if (c.omit_tag) expect(got.tag_contains).toBeUndefined();
    if (c.expect_tag) expect(got.tag_contains).toBe(c.expect_tag);
    if (c.expect_message) expect(got.message_contains).toBe(c.expect_message);
  });
});
