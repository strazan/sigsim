import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["__test__/**/*.test.ts"],
    testTimeout: 30_000,
    benchmark: {
      include: ["__test__/bench/**/*.bench.ts"],
    },
    hookTimeout: 300_000,
  },
});
