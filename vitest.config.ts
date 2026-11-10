import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["server/tests/**/*.test.ts"],
    setupFiles: ["./server/tests/setup.ts"],
    testTimeout: 10000
  }
});
