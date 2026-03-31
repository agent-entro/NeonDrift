import { defineConfig } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "/neon",
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
      "@neondrift/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
