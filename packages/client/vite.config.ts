import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@neondrift/shared": "../shared/src/index.ts",
    },
  },
});
