import { describe, expect, it } from "vitest";

import { decodeIpcError, errorText, ipcErrorCode } from "./error";
import type { IpcError } from "./types";

const notFound: IpcError = { code: "not_found", message: "没有这个目录" };

describe("decodeIpcError", () => {
  it("一次解码 {code,message}", () => {
    expect(decodeIpcError(notFound)).toEqual(notFound);
    expect(errorText(notFound)).toBe("没有这个目录");
    expect(ipcErrorCode(notFound)).toBe("not_found");
  });

  it("不是 IpcError 对象则失败", () => {
    expect(() => decodeIpcError(JSON.stringify(notFound))).toThrow(TypeError);
    expect(() => decodeIpcError("plain")).toThrow(TypeError);
    expect(() => decodeIpcError({ message: "only" })).toThrow(TypeError);
    expect(() => errorText("plain")).toThrow(TypeError);
    expect(ipcErrorCode("plain")).toBeUndefined();
    expect(ipcErrorCode({ message: "only" })).toBeUndefined();
  });
});
