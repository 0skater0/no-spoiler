// Replaces the screenshots of the AMO listing with docs/store/screenshot-*.png
// (file name order) and their captions from docs/store/captions.json.
// Needs AMO_JWT_ISSUER and AMO_JWT_SECRET (same credentials as publish-firefox.mjs).
// Usage: node scripts/sync-amo-previews.mjs [--dry-run] [--annotate]
//   --dry-run   only print the plan (reads the listing, changes nothing)
//   --annotate  report failures as a GitHub Actions warning (exit code stays 1)
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { GECKO_ID } from "./build.mjs";
import { applyPreviewSync, createAmoClient, planPreviewSync } from "./lib/amo.mjs";
import { escapeCommandData } from "./lib/gh-actions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "docs", "store");

const { values } = parseArgs({
  options: { "dry-run": { type: "boolean", default: false }, annotate: { type: "boolean", default: false } },
});

async function main() {
  const { AMO_JWT_ISSUER, AMO_JWT_SECRET } = process.env;
  if (!AMO_JWT_ISSUER || !AMO_JWT_SECRET) throw new Error("AMO_JWT_ISSUER and AMO_JWT_SECRET must be set.");

  const captions = JSON.parse(readFileSync(path.join(STORE, "captions.json"), "utf8"));
  const local = readdirSync(STORE)
    .filter((f) => /^screenshot-.*\.png$/.test(f))
    .sort()
    .map((name) => ({ name, caption: captions[name] }));

  // The GUID stays the same when the listing's slug changes.
  const client = createAmoClient({ issuer: AMO_JWT_ISSUER, secret: AMO_JWT_SECRET, addon: GECKO_ID });
  const plan = planPreviewSync(await client.previews(), local);

  for (const u of plan.uploads) console.log(`upload  ${u.name} -> position ${u.position}: ${u.caption}`);
  for (const d of plan.deletes) console.log(`delete  preview ${d.id} (${d.imageUrl})`);
  if (values["dry-run"]) return;
  await applyPreviewSync(client, plan, (name) => readFileSync(path.join(STORE, name)));
}

try {
  await main();
} catch (err) {
  if (!values.annotate) throw err;
  const repair = "To repair, run the workflow Sync AMO screenshots on the release tag (or main); it replaces all previews on the listing.";
  // GitHub Actions shows ::warning lines as annotations of the run.
  console.log(`::warning title=AMO screenshot sync failed::${escapeCommandData(`${err.message}\n${repair}`)}`);
  // Still a failure, so the workflow can tell an update from a failed one by the step outcome.
  process.exitCode = 1;
}
