import { describe, expect, it } from "vitest";

import { presenceClipBornState } from "./presence-model";

describe("presenceClipBornState", () => {
  it("clip 且播动效时出生 closed，才能 0fr→1fr", () => {
    expect(presenceClipBornState({ when: true, usesClip: true, skipMotion: false })).toBe("closed");
  });

  it("跳过动效或非 clip 出生即 open", () => {
    expect(presenceClipBornState({ when: true, usesClip: true, skipMotion: true })).toBe("open");
    expect(presenceClipBornState({ when: true, usesClip: false, skipMotion: false })).toBe("open");
  });

  it("when=false 出生 closed", () => {
    expect(presenceClipBornState({ when: false, usesClip: true, skipMotion: false })).toBe("closed");
  });
});
