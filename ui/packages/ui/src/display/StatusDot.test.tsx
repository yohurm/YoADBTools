import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { render } from "@solidjs/testing-library";
import { YoStatusDot } from "./StatusDot";

describe("YoStatusDot", () => {
  it("缺省 offline 且装饰 hidden", () => {
    const { container } = render(() => <YoStatusDot />);
    const dot = container.querySelector(".yohu-status-dot");
    expect(dot?.getAttribute("data-tone")).toBe("offline");
    expect(dot?.getAttribute("aria-hidden")).toBe("true");
    expect(dot?.getAttribute("role")).toBeNull();
  });

  it("有 label 才暴露", () => {
    const { container } = render(() => <YoStatusDot tone="success" label="在线" />);
    const dot = container.querySelector(".yohu-status-dot");
    expect(dot?.getAttribute("data-tone")).toBe("success");
    expect(dot?.getAttribute("aria-label")).toBe("在线");
    expect(dot?.getAttribute("role")).toBe("img");
    expect(dot?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("关掉写成 true 只留在 closedAttr", () => {
    const src = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const bodies = productionBodies(src, "dom/flag.ts", "return open ? undefined : true;");
    expect(bodies.length).toBeGreaterThan(10);
    for (const body of bodies) expect(body).not.toContain("? undefined : true");
  });
});

function productionBodies(root: string, owner: string, line: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) {
      out.push(...productionBodies(full, owner, line));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name) || name.includes(".test.")) continue;
    let text = readFileSync(full, "utf8");
    if (full.replaceAll("\\", "/").endsWith(owner)) text = text.replace(line, "");
    out.push(text);
  }
  return out;
}
