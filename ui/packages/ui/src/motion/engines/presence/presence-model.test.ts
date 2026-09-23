import { describe, expect, it } from "vitest";

import { presenceBornState } from "./presence-model";

describe("presenceBornState", () => {
  it("transition 且播动效时出生 closed，才能从位移/0fr 起步", () => {
    expect(presenceBornState({ when: true, delayOpen: true, skipMotion: false })).toBe("closed");
  });

  it("跳过动效或非 transition 出生即 open", () => {
    expect(presenceBornState({ when: true, delayOpen: true, skipMotion: true })).toBe("open");
    expect(presenceBornState({ when: true, delayOpen: false, skipMotion: false })).toBe("open");
  });

  it("when=false 出生 closed", () => {
    expect(presenceBornState({ when: false, delayOpen: true, skipMotion: false })).toBe("closed");
  });
});
