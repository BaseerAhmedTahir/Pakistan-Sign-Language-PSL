import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        author: resolve(__dirname, "author.html"),
      },
      output: {
        manualChunks: {
          three: ["three"],
          "three-vrm": ["@pixiv/three-vrm"],
        },
      },
    },
  },
});
