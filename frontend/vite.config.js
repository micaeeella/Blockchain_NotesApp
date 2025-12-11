import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  plugins: [
    react(),
    wasm(),   // REQUIRED for CSL WASM
  ],
  optimizeDeps: {
    exclude: ["@emurgo/cardano-serialization-lib-browser"],
  },
});
