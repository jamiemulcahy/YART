import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// GitHub Pages serves 404.html for unknown paths, which gives us SPA routing.
const copy404Plugin = () => ({
  name: "copy-404",
  closeBundle() {
    const dist = resolve(__dirname, "dist");
    writeFileSync(resolve(dist, "404.html"), readFileSync(resolve(dist, "index.html"), "utf-8"));
  },
});

const workerUrl = process.env.WORKER_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), copy404Plugin()],
  server: {
    host: "0.0.0.0", // Required for container environments
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      "/api": { target: workerUrl, ws: true, changeOrigin: true },
    },
  },
});
