import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import TanStackRouterVite from "@tanstack/router-plugin/vite";

import tailwindVite from "@tailwindcss/vite";

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const webPort = Number(env.VITE_PORT || "4173");

  return {
    plugins: [
      tailwindVite(),
      TanStackRouterVite({target: "react", autoCodeSplitting: true}),
      react(),
    ],
    server: {
      port: webPort,
      strictPort: true,
    },
    preview: {
      port: webPort,
      strictPort: true,
    },
  };
});
