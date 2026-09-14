import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";

/** 工作台 CSS 放到 body 末尾，避免挡住 HTML 画布层首帧。 */
function deferWorkbenchCss(): Plugin {
  return {
    name: "yohu-defer-workbench-css",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        const links: string[] = [];
        const stripped = html.replace(/<link rel="stylesheet"[^>]*>/g, (tag) => {
          links.push(tag);
          return "";
        });
        if (links.length === 0) {
          return html;
        }
        return stripped.replace("</body>", `${links.join("\n")}\n</body>`);
      },
    },
  };
}

/** Vite 端口唯一来源：`app/yohu-adbtools/tauri.conf.json` 的 `build.devUrl`。 */
function tauriDevPort(): number {
  const confPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/yohu-adbtools/tauri.conf.json",
  );
  const conf = JSON.parse(readFileSync(confPath, "utf8")) as {
    build?: { devUrl?: string };
  };
  const devUrl = conf.build?.devUrl;
  if (!devUrl) {
    throw new Error(`tauri.conf.json 缺少 build.devUrl: ${confPath}`);
  }
  const port = Number(new URL(devUrl).port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`无法从 Tauri devUrl 解析端口: ${devUrl}`);
  }
  return port;
}

export default defineConfig({
  plugins: [solid(), deferWorkbenchCss()],
  server: {
    port: tauriDevPort(),
    strictPort: true,
    host: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});
