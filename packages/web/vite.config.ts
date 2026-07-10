import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import TanStackRouterVite from "@tanstack/router-plugin/vite";
import path from "node:path";

import tailwindVite from "@tailwindcss/vite";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const previewPort = Number(env.PORT || process.env.PORT || "4173");
  const allowedHosts = [".railway.app"];
  const apiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET ||
    env.VITE_PUBLIC_API_URL ||
    env.VITE_API_URL ||
    "http://localhost:3100";

  if (env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedHosts.unshift(env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_PUBLIC_DOMAIN!);
  }

  return {
    plugins: [
      tailwindVite(),
      TanStackRouterVite({target: "react", autoCodeSplitting: true}),
      react(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            tanstack: ["@tanstack/react-query", "@tanstack/react-router"],
          },
        },
      },
    },
    server: {
      host: true,
      port: 4173,
      strictPort: true,
      allowedHosts,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    preview: {
      host: true,
      port: previewPort,
      strictPort: true,
      allowedHosts,
    },
  };
});
