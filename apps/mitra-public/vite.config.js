import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isPreviewFlatAssets = process.env.MITRA_PREVIEW_FLAT_ASSETS === "1";

export default defineConfig({
  plugins: [react()],
  build: isPreviewFlatAssets ? { assetsDir: "" } : undefined,
});
