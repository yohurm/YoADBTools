import { describe, expect, it } from "vitest";

import { findHeadOverlap, isSuffixAppend, lowerBoundSeq } from "./seq";

interface Row {
  seq: number;
}

const seqOf = (row: Row): number => row.seq;
const rows = (...seqs: number[]): Row[] => seqs.map((seq) => ({ seq }));

describe("stream/seq — 唯一 seq 对账原语", () => {
  it("lowerBoundSeq 返回第一个 >= target 的下标", () => {
    expect(lowerBoundSeq(rows(0, 2, 4), seqOf, 0)).toBe(0);
    expect(lowerBoundSeq(rows(0, 2, 4), seqOf, 1)).toBe(1);
    expect(lowerBoundSeq(rows(0, 2, 4), seqOf, 4)).toBe(2);
    expect(lowerBoundSeq(rows(0, 2, 4), seqOf, 5)).toBe(3);
    expect(lowerBoundSeq([], seqOf, 3)).toBe(0);
  });

  it("findHeadOverlap 找到新首行在旧批次的位置；找不到返回 -1", () => {
    expect(findHeadOverlap(rows(0, 1, 2, 3), rows(2, 3, 4), seqOf)).toBe(2);
    expect(findHeadOverlap(rows(0, 1, 2), rows(0, 1, 2, 3), seqOf)).toBe(0);
    expect(findHeadOverlap(rows(0, 1, 2), rows(5, 6), seqOf)).toBe(-1);
    expect(findHeadOverlap([], rows(1), seqOf)).toBe(-1);
    expect(findHeadOverlap(rows(1), [], seqOf)).toBe(-1);
  });

  it("isSuffixAppend 只在真后缀追加时成立", () => {
    expect(isSuffixAppend(rows(0, 1), rows(0, 1, 2), seqOf)).toEqual({
      ok: true,
      evicted: 0,
      tailStart: 2,
    });
    expect(isSuffixAppend(rows(0, 1, 2), rows(1, 2, 3), seqOf)).toEqual({
      ok: true,
      evicted: 1,
      tailStart: 2,
    });
    // 中段替换（不是后缀）：同一首 seq 但旧尾行与重合段末不相等
    expect(isSuffixAppend(rows(0, 1, 2), rows(0, 9, 3), seqOf)).toEqual({ ok: false });
    // 完全不同
    expect(isSuffixAppend(rows(0, 1), rows(5, 6), seqOf)).toEqual({ ok: false });
  });
});
