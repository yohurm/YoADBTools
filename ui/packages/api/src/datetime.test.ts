import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DATETIME_DISPLAY_LEN,
  DATETIME_SECONDS_LEN,
  TIME_DISPLAY_LEN,
  TIME_MILLIS_DISPLAY_LEN,
  canonicalizeDateTime,
  canonicalizeDateTimeSeconds,
  clockDisplayLen,
  formatClock,
  formatDateTime,
  formatDateTimeFromMs,
  formatLogTs,
} from "./datetime";

const testdata = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../core/yohu-domain/testdata/datetime.json",
);

type CanonCase = { input: string; expect?: string | null };
type Fixture = {
  canonicalize: CanonCase[];
  canonicalize_seconds: CanonCase[];
  format: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millis: number;
    expect?: string | null;
  }[];
  projection: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    millis: number;
    time_millis: string;
    time: string;
    datetime_millis: string;
    datetime: string;
  }[];
};

describe("datetime（与 domain testdata/datetime.json 同一套向量）", () => {
  const fixture = JSON.parse(readFileSync(testdata, "utf8")) as Fixture;

  it.each(fixture.canonicalize)("canonicalize $input", (c) => {
    expect(canonicalizeDateTime(c.input)).toBe(c.expect ?? null);
  });

  it.each(fixture.canonicalize_seconds)("canonicalize_seconds $input", (c) => {
    const text = canonicalizeDateTimeSeconds(c.input);
    expect(text).toBe(c.expect ?? null);
    if (text) expect(text.length).toBe(DATETIME_SECONDS_LEN);
  });

  it.each(fixture.format)("format $year-$month-$day", (c) => {
    const text = formatDateTime(c.year, c.month, c.day, c.hour, c.minute, c.second, c.millis);
    expect(text).toBe(c.expect ?? null);
    if (text) expect(text.length).toBe(DATETIME_DISPLAY_LEN);
  });

  it("formatDateTimeFromMs 是毫秒墙钟形状", () => {
    expect(formatDateTimeFromMs(Date.now())).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it.each(fixture.projection)("projection $datetime_millis", (c) => {
    const args = [c.year, c.month, c.day, c.hour, c.minute, c.second, c.millis] as const;
    expect(formatClock(...args, "time_millis")).toBe(c.time_millis);
    expect(formatClock(...args, "time")).toBe(c.time);
    expect(formatClock(...args, "datetime_millis")).toBe(c.datetime_millis);
    expect(formatClock(...args, "datetime")).toBe(c.datetime);
    expect(formatClock(...args, "time_millis")?.length).toBe(TIME_MILLIS_DISPLAY_LEN);
    expect(formatClock(...args, "time")?.length).toBe(TIME_DISPLAY_LEN);
    expect(formatLogTs(c.datetime_millis, "datetime_millis")).toBe(c.datetime_millis);
    expect(formatLogTs(c.datetime_millis, "datetime")).toBe(c.datetime);
    expect(formatLogTs(c.datetime_millis, "time_millis")).toBe(c.time_millis);
    expect(formatLogTs(c.datetime_millis, "time")).toBe(c.time);
  });

  it("投影失败不回脏原文", () => {
    expect(formatClock(2026, 13, 1, 0, 0, 0, 0, "time_millis")).toBeNull();
    expect(formatLogTs("raw", "time")).toBe("");
    expect(clockDisplayLen("datetime_millis")).toBe(DATETIME_DISPLAY_LEN);
    expect(clockDisplayLen("time_millis")).toBe(TIME_MILLIS_DISPLAY_LEN);
  });
});
