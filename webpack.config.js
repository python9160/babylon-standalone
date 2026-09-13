import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

// Recreate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and parse config safely in ESM
const config = JSON.parse(
  fs.readFileSync(new URL("./config.json", import.meta.url), "utf-8"),
);

export default {
  mode: "production",
  entry: config.gameEntry || "./src/engine/Game.ts",
  output: {
    filename: "Game.js",
    path: path.resolve(__dirname, "dist-wp"),
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  stats: "verbose",
};
