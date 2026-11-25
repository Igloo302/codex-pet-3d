import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolve workspace packages to their TypeScript sources so the web app can be
// built directly (without requiring @codex-pet-3d/core / spec to be compiled first).
const coreSrc = new URL("../core/src/index.ts", import.meta.url).pathname;
// Keep browser-safe spec entrypoints split from Node-only Ajv/fs manifest loader.
const specSrc = new URL("../spec/src/types.ts", import.meta.url).pathname;
const specGlbSrc = new URL("../spec/src/glb.ts", import.meta.url).pathname;
const specErrorsSrc = new URL("../spec/src/errors.ts", import.meta.url).pathname;

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@codex-pet-3d/core": coreSrc,
      "@codex-pet-3d/spec/glb": specGlbSrc,
      "@codex-pet-3d/spec/errors": specErrorsSrc,
      "@codex-pet-3d/spec": specSrc,
    },
  },
  server: {
    fs: {
      // The sample asset lives in the repository-level assets/ directory.
      allow: ["../.."],
    },
  },
});
