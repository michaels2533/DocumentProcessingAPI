import { defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({mode}) => {

  //Loads .env file based on 'mode' in current working directory
  const env = loadEnv(mode, process.cwd())

  // Vite Config
  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      allowedHosts: ["docproc-frontend.onrender.com", ".onrender.com"],
      proxy: {
        "/api": {
          target: env.VITE_API_TARGET,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: 5173,
      allowedHosts: ["docproc-frontend.onrender.com", ".onrender.com"],
    },
  }
  });
