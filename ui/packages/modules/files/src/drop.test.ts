import { describe, expect, it } from "vitest";

import type { NativeDragDropEvent } from "@yohu/api";

import {
  adoptDropSession,
  cssPointFromPhysical,
  destDirFromEntries,
  dropCommit,
  DROP_IDLE,
  dropSessionForEvent,
  dropSessionWithDir,
  localBaseName,
  namesForDrag,
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
  const ready = { hasDevice: true, blocked: false, space, entries, intoFolder: true, scale: 1 };

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

  it("开启指向文件夹才用清单下标；scale 由调用方传入", () => {
    expect(dropCommit(drop(10, 50), ready)).toEqual({
      paths: ["C:/a.txt"],
      dirName: "Alarms",
    });
    expect(dropCommit(drop(10, 80), ready)).toEqual({
      paths: ["C:/a.txt"],
      dirName: null,
    });
    expect(dropCommit(drop(20, 100), { ...ready, scale: 2 })).toEqual({
      paths: ["C:/a.txt"],
      dirName: "Alarms",
    });
    expect(dropCommit(drop(10, 50), { ...ready, scale: 2 })).toEqual({
      paths: ["C:/a.txt"],
      dirName: null,
    });
  });

  it("松手 dest 与热态同一套下标，滚动后不要求行在 DOM", () => {
    expect(
      dropCommit(drop(10, 50), { ...ready, space: { ...space, scrollTop: 48 } }),
    ).toEqual({
      paths: ["C:/a.txt"],
      dirName: "DCIM",
    });
  });

  it("不可投或空 paths 不提交", () => {
    expect(
      dropCommit(drop(10, 50), { ...ready, blocked: true }),
    ).toBeUndefined();
    expect(dropCommit(drop(10, 50, []), ready)).toBeUndefined();
  });
});

describe("destDirFromEntries", () => {
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

describe("namesForDrag", () => {
  it("拖已选项带走全部选中；拖未选项只带该项", () => {
    expect(namesForDrag(["a.txt", "b.txt"], "a.txt")).toEqual(["a.txt", "b.txt"]);
    expect(namesForDrag(["a.txt", "b.txt"], "c.txt")).toEqual(["c.txt"]);
    expect(namesForDrag([], "solo.txt")).toEqual(["solo.txt"]);
  });
});
