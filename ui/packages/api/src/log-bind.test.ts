import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { ProcessEntry } from "./types";
import {
  emptyBinding,
  HISTORY_PID_CAP,
  pidSetOf,
  rebindPids,
  toWireFilter,
  type PidBinding,
} from "./log-bind";

const testdata = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../core/yohu-domain/testdata/log_bind.json",
);

const domainSource = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../core/yohu-domain/src/log_bind.rs",
);

type Fixture = {
  /** 产品默认历史 PID 上限（`default_cap`）。缺键时由 Rust 常量兜底锁。 */
  default_cap?: number;
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

/** `yohu-domain::HISTORY_PID_CAP` 的唯一来源。只读解析，不改 core。 */
function domainHistoryPidCap(): number {
  const match = /pub const HISTORY_PID_CAP: usize = (\d+);/.exec(readFileSync(domainSource, "utf8"));
  if (!match) throw new Error("core/yohu-domain/src/log_bind.rs 缺 HISTORY_PID_CAP 常量");
  return Number(match[1]);
}

describe("log-bind（与 domain testdata/log_bind.json 同一套向量）", () => {
  it("默认历史 PID 上限受 fixture / Rust 常量双端锁", () => {
    const cap = domainHistoryPidCap();
    expect(HISTORY_PID_CAP).toBe(cap);
    if (fixture.default_cap !== undefined) {
      expect(HISTORY_PID_CAP).toBe(fixture.default_cap);
    }
  });

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

  it("包名与子进程后缀各只比一次", () => {
    const owner = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "log-bind.ts"), "utf8")
      .replace("return name === pkg", "")
      .replace("return name.startsWith(`${pkg}:`)", "");
    expect(owner).not.toContain("name === pkg");
    expect(owner).not.toContain("startsWith(`${pkg}:`)");
  });
});
