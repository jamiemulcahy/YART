import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

// Plugin to copy index.html to 404.html for GitHub Pages SPA routing
const copy404Plugin = () => ({
  name: "copy-404",
  closeBundle() {
    const distPath = resolve(__dirname, "dist");
    const indexContent = readFileSync(resolve(distPath, "index.html"), "utf-8");
    writeFileSync(resolve(distPath, "404.html"), indexContent);
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copy404Plugin()],
  server: {
    host: "0.0.0.0", // Required for container environments
    port: 5173,
  },
});
