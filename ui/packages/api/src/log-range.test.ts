import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeLogRange } from "./log-range";

/** 构造一行（seq=7, pid=1, tid=2, level='I', uid 无, tag="T", ts="t", msg="m"）的列式缓冲。 */
function oneRowBuffer(): ArrayBuffer {
  const bytes: number[] = [];
  const u32 = (v: number): void => {
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  };
  const u64 = (v: number): void => {
    u32(v >>> 0);
    u32(Math.floor(v / 0x1_0000_0000));
  };
  u32(1); // count
  u32(1); // tag_count
  u32(1); // tag len
  bytes.push("T".charCodeAt(0));
  bytes.push("I".charCodeAt(0)); // level[0]
  u32(0); // tag_idx[0]
  u64(7); // seq[0]
  u32(1); // pid[0]
  u32(2); // tid[0]
  bytes.push(0); // uid_flag[0]
  u32(0);
  u32(0); // uid_off [0,0]
  u32(0);
  u32(1); // ts_off [0,1]
  u32(0);
  u32(1); // msg_off [0,1]
  u32(0); // uid_blob_len
  u32(1); // ts_blob_len
  bytes.push("t".charCodeAt(0));
  u32(1); // msg_blob_len
  bytes.push("m".charCodeAt(0));
  return new Uint8Array(bytes).buffer;
}

describe("decodeLogRange（列式二进制）", () => {
  it("解出一行的全部字段", () => {
    const rows = decodeLogRange(oneRowBuffer());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      seq: 7,
      ts: "t",
      pid: 1,
      tid: 2,
      uid: undefined,
      level: "I",
      tag: "T",
      msg: "m",
    });
  });

  it("空/过短缓冲返回空数组", () => {
    expect(decodeLogRange(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]))).toEqual([]);
    expect(decodeLogRange(new Uint8Array([]))).toEqual([]);
  });

  it("解码 Rust 编码器生成的契约 fixture（跨语言）", () => {
    const buf = readFileSync(resolve(process.cwd(), "packages/api/testdata/log-range.bin"));
    const rows = decodeLogRange(new Uint8Array(buf));
    expect(rows).toEqual([
      {
        seq: 0,
        ts: "2026-01-01 00:00:00.000",
        pid: 100,
        tid: 1,
        uid: "u0",
        level: "I",
        tag: "TagA",
        msg: "hello",
      },
      {
        seq: 1,
        ts: "2026-01-01 00:00:00.001",
        pid: 101,
        tid: 2,
        uid: undefined,
        level: "E",
        tag: "TagA",
        msg: "world",
      },
    ]);
  });
});
