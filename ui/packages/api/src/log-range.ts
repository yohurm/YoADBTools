import type { LogLine } from "./types";

/**
 * 解码 `log.range` 的列式二进制（P0-3）。布局见 `yohu-logsrv::ring::encode_rows`：
 * count, tag 表, level[], tag_idx[], seq[], pid[], tid[], uid_flag[], uid_off[],
 * ts_off[], msg_off[], 三段字符串 blob。零 JSON 键名、零逐行对象语法解析。
 */
export function decodeLogRange(input: ArrayBuffer | Uint8Array): LogLine[] {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 8) return [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;
  const u32 = (): number => {
    const v = dv.getUint32(off, true);
    off += 4;
    return v;
  };
  const u64 = (): number => {
    const v = Number(dv.getBigUint64(off, true));
    off += 8;
    return v;
  };
  const dec = new TextDecoder();

  const count = u32();
  const tagCount = u32();
  if (count === 0) return [];
  const tags: string[] = new Array(tagCount);
  for (let i = 0; i < tagCount; i += 1) {
    const len = u32();
    tags[i] = dec.decode(bytes.subarray(off, off + len));
    off += len;
  }

  const levels = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) levels[i] = dv.getUint8(off + i);
  off += count;

  const tagIdx = new Array<number>(count);
  for (let i = 0; i < count; i += 1) tagIdx[i] = u32();
  const seq = new Array<number>(count);
  for (let i = 0; i < count; i += 1) seq[i] = u64();
  const pid = new Array<number>(count);
  for (let i = 0; i < count; i += 1) pid[i] = u32();
  const tid = new Array<number>(count);
  for (let i = 0; i < count; i += 1) tid[i] = u32();
  const uidFlag = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) uidFlag[i] = dv.getUint8(off + i);
  off += count;

  const readOffsets = (): number[] => {
    const arr = new Array<number>(count + 1);
    for (let i = 0; i <= count; i += 1) arr[i] = u32();
    return arr;
  };
  const uidOff = readOffsets();
  const tsOff = readOffsets();
  const msgOff = readOffsets();

  const readBlob = (): Uint8Array => {
    const len = u32();
    const blob = bytes.subarray(off, off + len);
    off += len;
    return blob;
  };
  const uidBlob = readBlob();
  const tsBlob = readBlob();
  const msgBlob = readBlob();

  const rows: LogLine[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    rows[i] = {
      seq: seq[i]!,
      ts: dec.decode(tsBlob.subarray(tsOff[i]!, tsOff[i + 1]!)),
      pid: pid[i]!,
      tid: tid[i]!,
      uid: uidFlag[i] ? dec.decode(uidBlob.subarray(uidOff[i]!, uidOff[i + 1]!)) : undefined,
      level: String.fromCharCode(levels[i]!),
      tag: tags[tagIdx[i]!] ?? "",
      msg: dec.decode(msgBlob.subarray(msgOff[i]!, msgOff[i + 1]!)),
    };
  }
  return rows;
}
