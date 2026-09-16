import { describe, expect, it } from "vitest";

import { formatWindowError } from "./js-error";

describe("formatWindowError", () => {
  it("带上 filename:lineno:colno 与 stack", () => {
    const error = new Error("Cannot read properties of undefined (reading 'length')");
    error.stack = "TypeError: Cannot read properties of undefined (reading 'length')\n    at CommandTree";
    expect(
      formatWindowError({
        message: error.message,
        filename: "http://tauri.localhost/assets/index.js",
        lineno: 12,
        colno: 34,
        error,
      }),
    ).toBe(
      `JS: ${error.message} @ http://tauri.localhost/assets/index.js:12:34\n${error.stack}`,
    );
  });

  it("没有位置时只留 message", () => {
    expect(
      formatWindowError({
        message: "boom",
        filename: "",
        lineno: 0,
        colno: 0,
        error: null,
      }),
    ).toBe("JS: boom");
  });
});
