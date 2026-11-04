import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: true,
    cssCodeSplit: true,
    rollupOptions: {
      // Dos entradas: la ventana principal y el mini reproductor.
      input: {
        main: resolve(__dirname, "index.html"),
        mini: resolve(__dirname, "mini.html"),
      },
    },
  },
});
