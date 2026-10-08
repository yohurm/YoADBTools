import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoFileIcon } from "./file-icons";
import { fileGlyphFor } from "./file-glyph";
import { Layout } from "./tokens/layout";

describe("fileGlyphFor", () => {
  it("目录与常见扩展名", () => {
    expect(fileGlyphFor("DCIM", true)).toBe("folder");
    expect(fileGlyphFor("app.apk", false)).toBe("apk");
    expect(fileGlyphFor("a.PNG", false)).toBe("image");
    expect(fileGlyphFor("v.mp4", false)).toBe("video");
    expect(fileGlyphFor("pack.zip", false)).toBe("archive");
    expect(fileGlyphFor("x.xml", false)).toBe("xml");
    expect(fileGlyphFor("unknown.bin", false)).toBe("file");
    expect(fileGlyphFor("link", true)).toBe("folder");
  });
});

describe("YoFileIcon", () => {
  it("同一字形可同时出现多份", () => {
    const { container } = render(() => (
      <>
        <YoFileIcon name="a" folder />
        <YoFileIcon name="b" folder />
      </>
    ));
    expect(container.querySelectorAll("svg[data-file-icon=folder]")).toHaveLength(2);
  });

  it("path/rect/circle 只标 data-fill，禁止 fill hex", () => {
    const samples = [
      { name: "DCIM", folder: true },
      { name: "a.bin", folder: false },
      { name: "app.apk", folder: false },
      { name: "p.png", folder: false },
      { name: "v.mp4", folder: false },
      { name: "s.mp3", folder: false },
      { name: "z.zip", folder: false },
      { name: "m.xml", folder: false },
      { name: "d.json", folder: false },
      { name: "n.txt", folder: false },
      { name: "r.pdf", folder: false },
    ];
    const { container } = render(() => (
      <>
        {samples.map((item) => (
          <YoFileIcon name={item.name} folder={item.folder} />
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

  it("缺省尺寸走 Layout.IconSm", () => {
    const { container } = render(() => <YoFileIcon name="a.bin" />);
    const svg = container.querySelector("svg.yohu-file-icon");
    expect(svg?.getAttribute("width")).toBe(String(Layout.IconSm));
    expect(svg?.getAttribute("height")).toBe(String(Layout.IconSm));
  });
});
