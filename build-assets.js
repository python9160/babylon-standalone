import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";

const ASSETS_DIR = "assets";
const DIST_DIR = process.argv[2] || "dist"; // allow custom dist folder via CLI arg
const R_TS_PATH = path.join("src", "engine", "R.ts");

// Create dist folder if needed
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR);

// // clean up old dist files
// fs.readdir(DIST_DIR, (err, files) => {
//   if (err) throw err;

//   for (const file of files) {
//     fs.unlink(path.join(DIST_DIR, file), (err) => {
//       if (err) throw err;
//     });
//   }
// });

// 🔍 Recursively get all asset files
function getAllFiles(dir) {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    return fs.statSync(fullPath).isDirectory()
      ? getAllFiles(fullPath)
      : fullPath;
  });
}

// 🧼 Sanitize file names for identifier keys
function safeKey(name) {
  return name.replace(/[^a-zA-Z0-9_$]/g, "").replace(/\./g, "");
}

// ✅ Create Base64 modules + track file mapping
const files = getAllFiles(ASSETS_DIR);
const rStructure = {};
const dtsStructure = {};

console.log("📦 Converting assets...\n");

files.forEach((filePath) => {
  const relative = path.relative(ASSETS_DIR, filePath).replace(/\\/g, "/");
  const buffer = fs.readFileSync(filePath);
  const mimeType = mime.lookup(filePath) || "application/octet-stream";
  const base64 = buffer.toString("base64");
  const dataURI = `data:${mimeType};base64,${base64}`;

  const assetKey = relative.replace(/[\\/]/g, "-");
  const outputPath = path.join(DIST_DIR, assetKey + ".js");

  fs.writeFileSync(outputPath, `B64Assets["${assetKey}"]="${dataURI}";`);

  const sizeKB = (buffer.length / 1024).toFixed(2);
  console.log(`✔ ${relative.padEnd(40)} ${sizeKB} KB`);

  // 📁 Build nested R object
  const parts = relative.split("/");
  let rCurr = rStructure;

  for (let i = 0; i < parts.length - 1; i++) {
    const key = safeKey(parts[i]);
    rCurr[key] = rCurr[key] || {};
    rCurr = rCurr[key];
  }

  const fileKey = safeKey(parts.at(-1));
  rCurr[fileKey] = `() => B64Assets["${assetKey}"]`;
});

// ✨ Find all .js base64 modules in dist
const assetScripts = fs
  .readdirSync(DIST_DIR)
  .filter((name) => name.endsWith(".js") && name !== "Game.js") // exclude main build
  .map((name) => `<script src="${name}"></script>`)
  .join("\n");

// 📥 Replace <!--ASSETS--> in index.html
const htmlInput = fs.readFileSync("index.html", "utf8");
const htmlOutput = htmlInput.replace("<!--ASSETS-->", assetScripts);

// 💾 Write updated HTML to dist/index.html
fs.writeFileSync(path.join(DIST_DIR, "index.html"), htmlOutput);

console.log("📄 index.html updated with asset scripts!");

// ✍️ Write src/R.ts
function generateRCode(obj, depth = 1) {
  const indent = "  ".repeat(depth);
  const lines = Object.entries(obj).map(([key, value]) => {
    return typeof value === "string"
      ? `${indent}${key}: ${value},`
      : `${indent}${key}: {\n${generateRCode(value, depth + 1)}\n${indent}},`;
  });
  return lines.join("\n");
}

const rTsContent = `export const R = {\n${generateRCode(rStructure)}\n};\n`;
fs.writeFileSync(R_TS_PATH, rTsContent);

console.log("\n✅ R.ts generated!");
