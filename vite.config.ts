import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/notes-app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png", "assets/logo-bird.png"],
      manifest: {
        name: "lrc神金笔记",
        short_name: "神金笔记",
        description: "支持文本与手写的离线平板笔记应用。",
        lang: "zh-CN",
        start_url: "/notes-app/",
        scope: "/notes-app/",
        display: "standalone",
        orientation: "any",
        theme_color: "#2f6fed",
        background_color: "#f4f6f8",
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        navigateFallback: "/notes-app/index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: []
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
