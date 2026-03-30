import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    environmentMatchGlobs: [
      ["packages/client/**", "jsdom"],
    ],
  },
});
