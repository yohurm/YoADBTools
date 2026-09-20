import { afterEach, describe, expect, it } from "vitest";

import { docSelCopyText, orderDocSel, readDocSel, selSlice, type DocSel, type SelLine } from "./selection";

const line = (over: Partial<SelLine> = {}): SelLine => ({
  seq: 2,
  docFrom: 0,
  text: "abcdef",
  ...over,
});

describe("orderDocSel", () => {
  it("反向选区按 seq/off 排成正向", () => {
    const sel: DocSel = { start: { seq: 3, off: 2 }, end: { seq: 1, off: 4 } };
    expect(orderDocSel(sel)).toEqual({ start: { seq: 1, off: 4 }, end: { seq: 3, off: 2 } });
  });
});

describe("selSlice", () => {
  it("整表 all 铺满本可视行", () => {
    expect(selSlice(line(), "all")).toEqual({ fromCh: 0, chars: 6 });
    expect(selSlice(line({ text: "" }), "all")).toBeNull();
  });

  it("同行切片映回可视偏移", () => {
    expect(selSlice(line(), { start: { seq: 2, off: 2 }, end: { seq: 2, off: 5 } })).toEqual({
      fromCh: 2,
      chars: 3,
    });
  });

  it("续行只切本片", () => {
    const wrap: SelLine = { seq: 2, docFrom: 10, text: "world" };
    expect(selSlice(wrap, { start: { seq: 2, off: 12 }, end: { seq: 2, off: 20 } })).toEqual({
      fromCh: 2,
      chars: 3,
    });
  });

  it("跨行：中间行整片，首行从 off 到末，末行到 off", () => {
    expect(selSlice(line({ seq: 1, text: "aaaa" }), { start: { seq: 1, off: 2 }, end: { seq: 3, off: 1 } })).toEqual({
      fromCh: 2,
      chars: 2,
    });
    expect(selSlice(line({ seq: 2, text: "bbbb" }), { start: { seq: 1, off: 2 }, end: { seq: 3, off: 1 } })).toEqual({
      fromCh: 0,
      chars: 4,
    });
    expect(selSlice(line({ seq: 3, text: "cccc" }), { start: { seq: 1, off: 2 }, end: { seq: 3, off: 1 } })).toEqual({
      fromCh: 0,
      chars: 1,
    });
    expect(selSlice(line({ seq: 9 }), { start: { seq: 1, off: 0 }, end: { seq: 3, off: 1 } })).toBeNull();
  });
});

describe("readDocSel", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  it("铬带占首位不计长；行盒作 Range 容器也能读偏移", () => {
    const list = document.createElement("div");
    const row = document.createElement("div");
    row.dataset.seq = "2";
    row.dataset.docFrom = "0";
    const band = document.createElement("span");
    band.dataset.logChrome = "";
    band.className = "yohu-doc-sel";
    band.textContent = "ghost";
    const text = document.createElement("span");
    text.textContent = "abcdef";
    row.append(band, text);
    list.append(row);
    document.body.append(list);
    const range = document.createRange();
    range.setStart(text.firstChild!, 2);
    range.setEnd(text.firstChild!, 5);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(readDocSel(list, selection, () => 6)).toEqual({
      start: { seq: 2, off: 2 },
      end: { seq: 2, off: 5 },
    });
    range.setStart(row, 1);
    range.setEnd(row, 2);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(readDocSel(list, selection, () => 6)).toEqual({
      start: { seq: 2, off: 0 },
      end: { seq: 2, off: 6 },
    });
  });
});

describe("docSelCopyText", () => {
  const messages = [
    { seq: 1, text: "one-doc" },
    { seq: 2, text: "two-doc" },
    { seq: 3, text: "three" },
  ];

  it("同行与跨行中间补齐", () => {
    expect(docSelCopyText({ start: { seq: 1, off: 4 }, end: { seq: 1, off: 7 } }, messages)).toBe("doc");
    expect(docSelCopyText({ start: { seq: 1, off: 2 }, end: { seq: 3, off: 3 } }, messages)).toBe(
      ["e-doc", "two-doc", "thr"].join("\n"),
    );
  });
});
