import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["packages/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./test-setup.ts"],
    /** jsdom 每文件初始化在本机较重；放宽单测超时，避免并行争用时的假失败（不改断言）。 */
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
