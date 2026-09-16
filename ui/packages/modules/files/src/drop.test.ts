import { describe, expect, it } from "vitest";

import type { NativeDragDropEvent } from "@yohu/api";

import {
  adoptDropSession,
  cssPointFromPhysical,
  destDirFromEntries,
  destDirName,
  dropCommit,
  DROP_IDLE,
  dropSessionForEvent,
  dropSessionWithDir,
  localBaseName,
  namesForDrag,
  pointInRect,
  readFolderTargets,
  type DropRect,
} from "./drop";

type DropEvt = Extract<NativeDragDropEvent, { type: "drop" }>;
type EnterEvt = Extract<NativeDragDropEvent, { type: "enter" }>;
type OverEvt = Extract<NativeDragDropEvent, { type: "over" }>;

function enter(x: number, y: number, paths: string[] = ["C:/a.txt"]): EnterEvt {
  return { type: "enter", paths, position: { x, y } } as EnterEvt;
}
function over(x: number, y: number): OverEvt {
  return { type: "over", position: { x, y } } as OverEvt;
}
function drop(x: number, y: number, paths: string[] = ["C:/a.txt"]): DropEvt {
  return { type: "drop", paths, position: { x, y } } as DropEvt;
}

function el(tag: string, attrs: Record<string, string> = {}, children: HTMLElement[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.appendChild(child);
  return node;
}

const DCIM: DropRect = { left: 0, top: 40, right: 200, bottom: 64 };

describe("cssPointFromPhysical", () => {
  it("物理点除以 scale；scale≤0 当 1", () => {
    expect(cssPointFromPhysical(200, 100, 2)).toEqual({ x: 100, y: 50 });
    expect(cssPointFromPhysical(10, 20, 0)).toEqual({ x: 10, y: 20 });
  });
});

describe("localBaseName", () => {
  it("Windows 文件与目录尾斜杠", () => {
    expect(localBaseName("C:\\Users\\a\\photo.png")).toBe("photo.png");
    expect(localBaseName("C:\\Users\\a\\DCIM\\")).toBe("DCIM");
  });

  it("POSIX 与无分隔符", () => {
    expect(localBaseName("/tmp/foo.txt")).toBe("foo.txt");
    expect(localBaseName("readme.md")).toBe("readme.md");
  });
});

describe("dropSessionForEvent", () => {
  const ready = { hasDevice: true, blocked: false };

  it("enter / over 有设备即热，不看点", () => {
    expect(
      dropSessionForEvent(enter(-99, -99), ready),
    ).toEqual({
      hot: true,
      dirName: null,
    });
    expect(dropSessionForEvent(over(10, 50), ready)).toEqual({
      hot: true,
      dirName: null,
    });
  });

  it("adopt 已热则保住 dirName，不把 over 刷成 null", () => {
    const hotNull = dropSessionForEvent(over(10, 50), ready);
    const hotDir = { hot: true as const, dirName: "MT2" };
    expect(adoptDropSession(hotDir, hotNull)).toEqual(hotDir);
    expect(adoptDropSession(DROP_IDLE, hotNull)).toEqual(hotNull);
    expect(adoptDropSession(hotDir, DROP_IDLE)).toEqual(DROP_IDLE);
  });

  it("dropSessionWithDir 仅命中变化才换对象", () => {
    const hot = { hot: true as const, dirName: "MT2" };
    expect(dropSessionWithDir(hot, "MT2")).toBe(hot);
    expect(dropSessionWithDir(hot, "DCIM")).toEqual({ hot: true, dirName: "DCIM" });
    expect(dropSessionWithDir(DROP_IDLE, "DCIM")).toBe(DROP_IDLE);
  });

  it("无设备、模态、leave、drop 都冷", () => {
    expect(
      dropSessionForEvent(enter(0, 0), { ...ready, hasDevice: false }),
    ).toEqual(DROP_IDLE);
    expect(dropSessionForEvent(over(0, 0), { ...ready, blocked: true })).toEqual(DROP_IDLE);
    expect(dropSessionForEvent({ type: "leave" }, ready)).toEqual(DROP_IDLE);
    expect(
      dropSessionForEvent(drop(10, 50), ready),
    ).toEqual(DROP_IDLE);
  });
});

describe("dropCommit", () => {
  const folders = [{ name: "DCIM", rect: DCIM }];
  const ready = { hasDevice: true, blocked: false, folders, intoFolder: true, scale: 1 };

  it("默认进当前目录，不读 position", () => {
    expect(
      dropCommit(
        drop(10, 50),
        { ...ready, intoFolder: false, scale: 99 },
      ),
    ).toEqual({
      paths: ["C:/a.txt"],
      dirName: null,
    });
  });

  it("开启指向文件夹才用行盒；scale 由调用方传入", () => {
    expect(dropCommit(drop(10, 50), ready)).toEqual({
      paths: ["C:/a.txt"],
      dirName: "DCIM",
    });
    expect(dropCommit(drop(10, 80), ready)).toEqual({
      paths: ["C:/a.txt"],
      dirName: null,
    });
    expect(dropCommit(drop(20, 100), { ...ready, scale: 2 })).toEqual({
      paths: ["C:/a.txt"],
      dirName: "DCIM",
    });
    expect(dropCommit(drop(10, 50), { ...ready, scale: 2 })).toEqual({
      paths: ["C:/a.txt"],
      dirName: null,
    });
  });

  it("不可投或空 paths 不提交", () => {
    expect(
      dropCommit(drop(10, 50), { ...ready, blocked: true }),
    ).toBeUndefined();
    expect(dropCommit(drop(10, 50, []), ready)).toBeUndefined();
  });

  it("destDirName 未命中目录则为空", () => {
    expect(pointInRect(DCIM, 10, 50)).toBe(true);
    expect(destDirName(10, 80, folders)).toBeNull();
    expect(destDirName(10, 50, folders)).toBe("DCIM");
  });
});

describe("destDirFromEntries", () => {
  const space = {
    rect: { left: 0, top: 40, right: 200, bottom: 400 },
    scrollTop: 0,
    itemHeight: 24,
  };
  const entries = [
    { name: "Alarms", kind: "dir" },
    { name: "a.txt", kind: "file" },
    { name: "DCIM", kind: "dir" },
  ];

  it("用下标命中目录，文件行与空白为 null", () => {
    expect(destDirFromEntries(10, 50, space, entries)).toBe("Alarms");
    expect(destDirFromEntries(10, 70, space, entries)).toBeNull();
    expect(destDirFromEntries(10, 92, space, entries)).toBe("DCIM");
    expect(destDirFromEntries(10, 20, space, entries)).toBeNull();
  });

  it("滚动后按下标，不要求行还在 DOM", () => {
    expect(
      destDirFromEntries(10, 50, { ...space, scrollTop: 48 }, entries),
    ).toBe("DCIM");
  });
});

describe("readFolderTargets", () => {
  it("只收 dir / symlink 的 data-key", () => {
    const dirInner = el("div", { "data-kind": "dir" });
    const dirRow = el("div", { "data-key": "DCIM" }, [dirInner]);
    const fileInner = el("div", { "data-kind": "file" });
    const fileRow = el("div", { "data-key": "a.txt" }, [fileInner]);
    const linkInner = el("div", { "data-kind": "symlink" });
    const linkRow = el("div", { "data-key": "linkdir" }, [linkInner]);
    const zone = el("div", { "data-drop": "files" }, [dirRow, fileRow, linkRow]);
    expect(readFolderTargets(zone).map((item) => item.name)).toEqual(["DCIM", "linkdir"]);
  });
});

describe("namesForDrag", () => {
  it("拖已选项带走全部选中；拖未选项只带该项", () => {
    expect(namesForDrag(["a.txt", "b.txt"], "a.txt")).toEqual(["a.txt", "b.txt"]);
    expect(namesForDrag(["a.txt", "b.txt"], "c.txt")).toEqual(["c.txt"]);
    expect(namesForDrag([], "solo.txt")).toEqual(["solo.txt"]);
  });
});
