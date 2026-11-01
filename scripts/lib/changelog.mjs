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

/**
 * Turns a changelog section (Markdown) into plain text for store fields that
 * do not render Markdown, such as the AMO release notes.
 */
export function toPlainText(markdown) {
  return markdown
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,6}\s+(.*)$/, "$1:")
        .replace(/^\s*[-*]\s+/, "\u2022 ")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1"),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
