import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const tunnelHost = env.VITE_TUNNEL_HOSTNAME?.trim();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      // Allow requests when the app is opened via Cloudflare Tunnel hostname.
      ...(tunnelHost ? { allowedHosts: [tunnelHost] } : {}),
      // HMR websockets do not work reliably through cloudflared; refresh manually.
      ...(tunnelHost ? { hmr: false } : {}),
      proxy: {
        "/coinflow-api": {
          target: "https://api-sandbox.coinflow.cash",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/coinflow-api/, "/api"),
        },
      },
    },
  };
});
