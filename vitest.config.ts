import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  css: {
    // Next's postcss.config.mjs uses the `"@tailwindcss/postcss"` string-plugin shorthand,
    // which only Next's own build pipeline understands. Nothing under tests/unit touches
    // CSS, so short-circuit PostCSS config discovery instead of trying to make it compatible.
    postcss: {},
  },
});
