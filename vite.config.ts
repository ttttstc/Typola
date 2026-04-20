import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
