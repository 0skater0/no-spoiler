// Extracts the notes of one version from CHANGELOG.md (Keep a Changelog format).
import { readFileSync } from "node:fs";

export function changelogSection(file, version) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const out = [];
  let inside = false;
  for (const line of lines) {
    if (line.startsWith(`## [${version}]`)) {
      inside = true;
      continue;
    }
    if (inside && (line.startsWith("## [") || /^\[[^\]]+\]: /.test(line))) break;
    if (inside) out.push(line);
  }
  return out.join("\n").trim();
}
