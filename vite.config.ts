import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/client"
  },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"]
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        changeOrigin: true,
        ws: true
      }
    }
  }
});
