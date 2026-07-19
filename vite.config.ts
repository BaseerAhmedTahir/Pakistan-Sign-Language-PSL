import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Deploy base: "/" locally; the Pages workflow sets BASE_PATH to
  // "/<repo-name>/" so assets resolve under the project-pages subpath.
  base: process.env.BASE_PATH || "/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        author: resolve(__dirname, "author.html"),
        study: resolve(__dirname, "study.html"),
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
