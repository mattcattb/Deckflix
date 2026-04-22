import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import TanStackRouterVite from "@tanstack/router-plugin/vite";

import tailwindVite from "@tailwindcss/vite";

export default defineConfig(({mode}) => {
  loadEnv(mode, process.cwd(), "");
  const previewPort = Number(process.env.PORT || "4173");
  const allowedHosts = [".railway.app"];

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    allowedHosts.unshift(process.env.RAILWAY_PUBLIC_DOMAIN);
  }

  return {
    plugins: [
      tailwindVite(),
      TanStackRouterVite({target: "react", autoCodeSplitting: true}),
      react(),
    ],
    server: {
      host: true,
      port: 4173,
      strictPort: true,
      allowedHosts,
    },
    preview: {
      host: true,
      port: previewPort,
      strictPort: true,
      allowedHosts,
    },
  };
});
