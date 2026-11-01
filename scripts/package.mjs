// Zips dist/firefox and dist/chrome with web-ext (run after build.mjs).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSERS } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
// Run the JS entry with node directly, so it also works on Windows (no shell shim).
const webExt = path.join(ROOT, "node_modules", "web-ext", "bin", "web-ext.js");

for (const browser of BROWSERS) {
  execFileSync(
    process.execPath,
    [
      webExt,
      "build",
      "--source-dir", path.join("dist", browser),
      "--artifacts-dir", "dist",
      "--filename", `no-spoiler-${browser}-${version}.zip`,
      "--overwrite-dest",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}
