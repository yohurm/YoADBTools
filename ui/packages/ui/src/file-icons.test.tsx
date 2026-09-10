import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoFileIcon } from "./file-icons";
import { fileGlyphFor } from "./file-glyph";

describe("fileGlyphFor", () => {
  it("目录与常见扩展名", () => {
    expect(fileGlyphFor("DCIM", "dir")).toBe("folder");
    expect(fileGlyphFor("app.apk", "file")).toBe("apk");
    expect(fileGlyphFor("a.PNG", "file")).toBe("image");
    expect(fileGlyphFor("v.mp4", "file")).toBe("video");
    expect(fileGlyphFor("pack.zip", "file")).toBe("archive");
    expect(fileGlyphFor("x.xml", "file")).toBe("xml");
    expect(fileGlyphFor("unknown.bin", "file")).toBe("file");
  });
});

describe("YoFileIcon", () => {
  it("同一字形可同时出现多份", () => {
    const { container } = render(() => (
      <>
        <YoFileIcon name="a" kind="dir" />
        <YoFileIcon name="b" kind="dir" />
      </>
    ));
    expect(container.querySelectorAll("svg[data-file-icon=folder]")).toHaveLength(2);
  });

  it("path/rect/circle 只标 data-fill，禁止 fill hex", () => {
    const samples: Array<{ name: string; kind: "dir" | "file" }> = [
      { name: "DCIM", kind: "dir" },
      { name: "a.bin", kind: "file" },
      { name: "app.apk", kind: "file" },
      { name: "p.png", kind: "file" },
      { name: "v.mp4", kind: "file" },
      { name: "s.mp3", kind: "file" },
      { name: "z.zip", kind: "file" },
      { name: "m.xml", kind: "file" },
      { name: "d.json", kind: "file" },
      { name: "n.txt", kind: "file" },
      { name: "r.pdf", kind: "file" },
    ];
    const { container } = render(() => (
      <>
        {samples.map((item) => (
          <YoFileIcon name={item.name} kind={item.kind} />
        ))}
      </>
    ));
    const painted = container.querySelectorAll("[data-fill]");
    expect(painted.length).toBeGreaterThan(0);
    for (const node of painted) {
      expect(node.getAttribute("data-fill")).toMatch(/^(body|mark)$/);
      expect(node.getAttribute("fill")).toBeNull();
    }
    expect(container.innerHTML).not.toMatch(/fill="#/);
  });
});
