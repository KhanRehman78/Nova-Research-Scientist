import { build as buildVite } from "vite";
import { build as buildEsbuild } from "esbuild";

if (process.env.VERCEL === "1") {
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length) {
    throw new Error(`Missing required Vercel environment variables: ${missing.join(", ")}`);
  }
}

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
