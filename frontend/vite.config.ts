import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Blackjack Studio",
        short_name: "Blackjack",
        description: "Private, offline blackjack basic-strategy practice.",
        id: "./",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#141c24",
        theme_color: "#141c24",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // Do not serve the app shell for unrelated URLs on the same origin.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  // Relative assets work both at / and a GitHub Pages repository subpath.
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
});
