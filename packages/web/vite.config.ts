import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import TanStackRouterVite from "@tanstack/router-plugin/vite";

import tailwindVite from "@tailwindcss/vite";

export default defineConfig(({mode}) => {
  loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      tailwindVite(),
      TanStackRouterVite({target: "react", autoCodeSplitting: true}),
      react(),
    ],
    server: {
      port: 4173,
      strictPort: true,
    },
    preview: {
      port: Number(process.env.PORT || "4173"),
      strictPort: true,
    },
  };
});
