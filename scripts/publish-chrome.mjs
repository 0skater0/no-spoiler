// Uploads the Chrome zip to an existing Chrome Web Store item and submits it
// for review (Chrome Web Store API v2). The item must have been created once
// by hand in the developer dashboard. Needs:
//   CWS_EXTENSION_ID   item ID from the dashboard
//   CWS_PUBLISHER_ID   publisher ID (in the dashboard URL)
//   CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN   OAuth client of a Google Cloud project
//                                                        with the Chrome Web Store API enabled
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
for (const key of ["CWS_EXTENSION_ID", "CWS_PUBLISHER_ID", "CWS_CLIENT_ID", "CWS_CLIENT_SECRET", "CWS_REFRESH_TOKEN"]) {
  if (!env[key]) {
    console.error(`${key} must be set.`);
    process.exit(1);
  }
}

const API = "https://chromewebstore.googleapis.com";
const item = `publishers/${env.CWS_PUBLISHER_ID}/items/${env.CWS_EXTENSION_ID}`;

async function call(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error_description || body.error?.message || body.error || res.statusText;
    throw new Error(`${init.method} ${url.replace(API, "")}: ${res.status} ${msg}`);
  }
  return body;
}

const { version } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const zip = readFileSync(path.join(ROOT, "dist", `no-spoiler-chrome-${version}.zip`));

const { access_token: token } = await call("https://www.googleapis.com/oauth2/v4/token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_id: env.CWS_CLIENT_ID,
    client_secret: env.CWS_CLIENT_SECRET,
    refresh_token: env.CWS_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }),
});
const auth = { Authorization: `Bearer ${token}` };

let upload = await call(`${API}/upload/v2/${item}:upload`, {
  method: "POST",
  headers: { ...auth, "X-Goog-Upload-Protocol": "raw", "X-Goog-Upload-File-Name": "extension.zip" },
  body: zip,
});
for (let i = 0; upload.uploadState === "IN_PROGRESS" && i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const status = await call(`${API}/v2/${item}:fetchStatus`, { method: "GET", headers: auth });
  upload = { uploadState: status.lastAsyncUploadState };
}
if (upload.uploadState !== "SUCCEEDED") {
  throw new Error(`Upload did not succeed: ${JSON.stringify(upload)}`);
}
console.log(`Uploaded version ${version}.`);

const published = await call(`${API}/v2/${item}:publish`, {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
});
console.log(`Submitted for review: ${JSON.stringify(published)}`);
