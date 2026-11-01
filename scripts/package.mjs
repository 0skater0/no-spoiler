// Zips dist/firefox and dist/chrome with web-ext (run after build.mjs).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSERS } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const webExt = path.join(ROOT, "node_modules", ".bin", "web-ext");

for (const browser of BROWSERS) {
  execFileSync(
    webExt,
    [
      "build",
      "--source-dir", path.join("dist", browser),
      "--artifacts-dir", "dist",
      "--filename", `no-spoiler-${browser}-${version}.zip`,
      "--overwrite-dest",
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
}
