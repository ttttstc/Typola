import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Pull common vendor groups into stable chunks so the main bundle
        // contains app code only. Each group is something the user pays for
        // once and amortizes across navigations.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('@milkdown')) return 'milkdown';
          if (id.includes('prosemirror')) return 'prosemirror';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) {
            return 'react';
          }
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('zustand')) return 'state';
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n';
          return;
        },
      },
    },
  },
});
