/**
 * 设备共享缓冲镜像（seq 去重 + 容量环形）。禁止串设备。
 */

import type { LogBatch, LogLine } from "@yohu/api";

export class RingMirror {
  private buf: LogLine[] = [];
  private lastSeq = -1;

  constructor(private capacity: number) {}

  pushBatch(batch: LogBatch): number {
    let added = 0;
    for (const line of batch.lines) {
      if (line.seq <= this.lastSeq) continue;
      this.lastSeq = line.seq;
      this.buf.push(line);
      added++;
    }
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
    return added;
  }

  replay(filter: (line: LogLine) => boolean, limit: number): LogLine[] {
    const out: LogLine[] = [];
    for (let i = this.buf.length - 1; i >= 0 && out.length < limit; i--) {
      const line = this.buf[i]!;
      if (filter(line)) out.push(line);
    }
    return out.reverse();
  }

  clear(): void {
    this.buf = [];
    this.lastSeq = -1;
  }

  size(): number {
    return this.buf.length;
  }

  lastSeqNumber(): number {
    return this.lastSeq;
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
  }
}

export class MirrorBank {
  private readonly maps = new Map<string, RingMirror>();

  constructor(private capacity: number) {}

  of(serial: string): RingMirror {
    let mirror = this.maps.get(serial);
    if (!mirror) {
      mirror = new RingMirror(this.capacity);
      this.maps.set(serial, mirror);
    }
    return mirror;
  }

  clear(serial: string): void {
    this.maps.get(serial)?.clear();
  }

  setCapacity(capacity: number): void {
    this.capacity = Math.max(1, capacity);
    for (const mirror of this.maps.values()) {
      mirror.setCapacity(this.capacity);
    }
  }
}
