import { defineConfig } from "vite";

export default defineConfig({
  base: "/neon/",
  server: {
    allowedHosts: ["agent.br-ndt.dev"],
    port: 5174,
    proxy: {
      "/neon/api": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/neon/, ""),
      },
      "/neon/ws": {
        target: "ws://localhost:3001",
        ws: true,
        rewrite: (path) => path.replace(/^\/neon/, ""),
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
