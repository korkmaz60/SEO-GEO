import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC compiles the decorators and emits the metadata NestJS dependency injection needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
