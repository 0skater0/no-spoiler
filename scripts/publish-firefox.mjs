// Submits dist/firefox as a new listed version to addons.mozilla.org.
// Needs AMO API credentials (Developer Hub -> Tools -> Manage API Keys):
//   AMO_JWT_ISSUER, AMO_JWT_SECRET
// Does not wait for the review; AMO publishes the version once it is approved.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changelogSection } from "./lib/changelog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { AMO_JWT_ISSUER, AMO_JWT_SECRET } = process.env;
if (!AMO_JWT_ISSUER || !AMO_JWT_SECRET) {
  console.error("AMO_JWT_ISSUER and AMO_JWT_SECRET must be set.");
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const notes = changelogSection(path.join(ROOT, "CHANGELOG.md"), version);
const tmp = mkdtempSync(path.join(os.tmpdir(), "ns-amo-"));
const metadata = path.join(tmp, "amo-metadata.json");
writeFileSync(metadata, JSON.stringify({ version: { release_notes: { "en-US": notes } } }));

execFileSync(
  process.execPath,
  [
    path.join(ROOT, "node_modules", "web-ext", "bin", "web-ext.js"),
    "sign",
    "--source-dir", path.join(ROOT, "dist", "firefox"),
    "--artifacts-dir", tmp,
    "--channel", "listed",
    "--amo-metadata", metadata,
    "--approval-timeout", "0",
    "--api-key", AMO_JWT_ISSUER,
    "--api-secret", AMO_JWT_SECRET,
  ],
  { stdio: "inherit" },
);
