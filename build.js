import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";

// 1. Read and parse config safely in ESM
const config = JSON.parse(
  fs.readFileSync(new URL("./config.json", import.meta.url), "utf-8"),
);

// 2. Define the output file and find its target directory
const outfile = "dist/Game.js";
const outdir = path.dirname(outfile);

// 3. Guarantee the directory exists before building
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

// 4. Run esbuild
esbuild
  .build({
    entryPoints: [config.gameEntry || "src/engine/Game.ts"],
    bundle: true,
    outfile: outfile,
    minify: true,
  })
  .catch(() => process.exit(1));
