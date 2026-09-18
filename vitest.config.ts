import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      "@localbridge/protocol": path.resolve(__dirname, "packages/protocol/src/index.ts"),
      "@localbridge/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@localbridge/security": path.resolve(__dirname, "packages/security/src/index.ts"),
    },
  },
});
