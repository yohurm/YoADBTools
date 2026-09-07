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

// Tauri dev 约定：固定端口 1420（tauri.conf.json devUrl 对齐）
export default defineConfig({
  plugins: [solid(), deferWorkbenchCss()],
  server: {
    port: 1420,
    strictPort: true,
    host: false,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: false,
  },
});
