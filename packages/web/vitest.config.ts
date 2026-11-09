import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const coreSrc = new URL("../core/src/index.ts", import.meta.url).pathname;
const specSrc = new URL("../spec/src/types.ts", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@codex-pet-3d/core": coreSrc,
      "@codex-pet-3d/spec": specSrc,
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
