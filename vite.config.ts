import { defineConfig } from "vite";

// Relative base so the built prototype runs from any path
// (local file server, GitHub Pages subfolder, Netlify, etc.).
export default defineConfig({
  base: "./",
});
