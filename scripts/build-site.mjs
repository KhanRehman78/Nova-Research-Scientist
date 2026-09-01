import { build as buildVite } from "vite";
import { build as buildEsbuild } from "esbuild";

await buildVite();
await buildEsbuild({
  entryPoints: ["worker/index.ts"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: false,
});
