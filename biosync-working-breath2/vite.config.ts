import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const authPort = Number(env.AUTH_PORT || process.env.AUTH_PORT || 4000);
  const authHost = env.AUTH_HOST || "127.0.0.1";

  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/api": {
          target: `http://${authHost}:${authPort}`, // must match server/index.js port
          changeOrigin: true,
        },
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
