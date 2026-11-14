import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The upstream course is a self-contained client component. Keep it intact and
// build a static entry for the mini-program, without requiring a Cloudflare worker.
export default defineConfig({
  base: "/junior-math/",
  plugins: [react()],
  build: { outDir: "../../server/junior-math-web", emptyOutDir: false },
});
