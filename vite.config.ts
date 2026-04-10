import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // Dev-only: browser → Coinflow tokenize APIs (avoids CORS). See src/coinflowApi.ts
      "/coinflow-api": {
        target: "https://api-sandbox.coinflow.cash",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/coinflow-api/, "/api"),
      },
    },
  },
});
