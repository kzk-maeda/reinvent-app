import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    https:
      process.env.LOCAL_TLS_KEY && process.env.LOCAL_TLS_CERT
        ? {
            key: readFileSync(process.env.LOCAL_TLS_KEY),
            cert: readFileSync(process.env.LOCAL_TLS_CERT),
          }
        : undefined,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist" },
});
