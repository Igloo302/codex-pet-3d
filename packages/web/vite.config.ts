import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolve workspace packages to their TypeScript sources so the web app can be
// built directly (without requiring @codex-pet-3d/core / spec to be compiled first).
const coreSrc = new URL("../core/src/index.ts", import.meta.url).pathname;
// The browser only needs spec's pure constants/types; going through its barrel
// would also pull the Node-oriented validator and GLB inspector into the graph.
const specSrc = new URL("../spec/src/types.ts", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@codex-pet-3d/core": coreSrc,
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
