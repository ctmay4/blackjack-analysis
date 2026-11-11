import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative assets work both at / and a GitHub Pages repository subpath.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
