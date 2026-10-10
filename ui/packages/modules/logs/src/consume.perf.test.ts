/**
 * 当前页格式化预算。全文不进界面；一页 80 行过滤加折叠应远小于一批 16ms。
 */

import { describe, expect, it } from "vitest";

import { LEVELS, matchesWireFilter, type LogLine } from "@yohu/api";

import { sessionWire, type SessionFilter } from "./filter";
import { collapseStack } from "./stack";
import { LOG_VIEW_PAGE } from "./viewport";

const line = (seq: number): LogLine => ({
  seq,
  ts: "2026-08-17 10:00:00.000",
  pid: 100 + (seq % 500),
  tid: 1,
  level: LEVELS[seq % LEVELS.length]!,
  tag: ["ActivityManager", "SystemServer", "BatteryService", "OkHttp"][seq % 4]!,
  msg: `log message number ${seq} with some payload text for filtering performance`,
});

const sessionFilter = (over: Partial<SessionFilter>): SessionFilter => ({
  levels: ["W"],
  tagContains: "",
  keyword: "",
  scope: { kind: "all" },
  pidSet: [],
  ...over,
});

describe("日志当前页性能", () => {
  it("一页过滤加折叠低于一批预算", () => {
    const page = Array.from({ length: LOG_VIEW_PAGE }, (_, seq) => line(seq));
    const filters = [
      sessionFilter({ levels: ["W"], keyword: "payload" }),
      sessionFilter({ levels: ["E"] }),
      sessionFilter({ levels: ["I"] }),
    ];
    const start = performance.now();
    for (let i = 0; i < 50; i++) {
      for (const filter of filters) {
        const wire = sessionWire(filter);
        collapseStack(page.filter((row) => matchesWireFilter(row, wire)));
      }
    }
    expect(performance.now() - start).toBeLessThan(16 * 50);
  });
});
