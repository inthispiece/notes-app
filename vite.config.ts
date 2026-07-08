import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const pdfJsRoot = fileURLToPath(new URL("./node_modules/pdfjs-dist/", import.meta.url));

function emitPdfJsSupportAssets(): Plugin {
  const directories = ["cmaps", "standard_fonts", "wasm", "image_decoders", "iccs"];
  return {
    name: "emit-pdfjs-support-assets",
    generateBundle() {
      const emitDirectory = (directory: string, relative = "") => {
        const absolute = join(pdfJsRoot, directory, relative);
        for (const entry of readdirSync(absolute)) {
          const entryRelative = relative ? `${relative}/${entry}` : entry;
          const entryAbsolute = join(absolute, entry);
          if (statSync(entryAbsolute).isDirectory()) {
            emitDirectory(directory, entryRelative);
            continue;
          }
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${directory}/${entryRelative}`,
            source: readFileSync(entryAbsolute)
          });
        }
      };

      directories.forEach((directory) => emitDirectory(directory));
    }
  };
}

export default defineConfig({
  base: "/notes-app/",
  plugins: [
    react(),
    emitPdfJsSupportAssets(),
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
        globPatterns: ["**/*.{js,mjs,css,html,ico,png,svg,webmanifest,bcmap,pfb,ttf,wasm,icc}"],
        navigateFallback: "/notes-app/index.html",
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: []
      },
      devOptions: {
        enabled: false
      }
    })
  ]
});
