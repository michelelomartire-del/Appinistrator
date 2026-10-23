import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Due build:
 * - `vite build` (mode production) → dist/public, servita da Express;
 * - `vite build --mode demo`      → dist/demo, demo statica senza backend.
 */
export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    plugins: [react()],
    base: "/",
    resolve: {
      alias: {
        "@shared": path.resolve(__dirname, "src/shared"),
        "@client": path.resolve(__dirname, "src/client"),
      },
    },
    define: {
      __DEMO__: JSON.stringify(demo),
    },
    server: {
      host: "0.0.0.0",
      port: demo ? 5174 : 5173,
      allowedHosts: true,
      proxy: demo ? undefined : { "/api": "http://127.0.0.1:4000" },
    },
    preview: {
      host: "0.0.0.0",
      port: demo ? 4174 : 4173,
      allowedHosts: true,
    },
    build: {
      outDir: demo ? "dist/demo" : "dist/public",
      emptyOutDir: true,
      sourcemap: false,
      // la demo include lo snapshot dei dati dimostrativi in un unico file
      chunkSizeWarningLimit: demo ? 1200 : 500,
    },
  };
});
