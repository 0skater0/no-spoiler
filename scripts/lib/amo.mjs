// addons.mozilla.org API v5: JWT auth and the preview (screenshot) endpoints.
// https://mozilla.github.io/addons-server/topics/api/addons.html
import { createHmac, randomUUID } from "node:crypto";

export const AMO_API = "https://addons.mozilla.org/api/v5";
// AMO rejects tokens that live longer than five minutes.
const TOKEN_LIFETIME_S = 60;

const base64url = (value) => Buffer.from(value).toString("base64url");

export function amoJwt(issuer, secret, { now = Date.now(), jti = randomUUID() } = {}) {
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: issuer, jti, iat, exp: iat + TOKEN_LIFETIME_S }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Replaces every listing preview with the local screenshots, in file order.
 * AMO re-encodes uploads, so remote images cannot be matched to local files;
 * the caller only syncs when the screenshots changed.
 * @param {{id: number}[]} remote previews from the add-on detail, in listing order
 * @param {{name: string, caption?: string}[]} local screenshots in display order
 */
export function planPreviewSync(remote, local) {
  if (!local.length) throw new Error("No local screenshots; refusing to empty the listing");
  const missing = local.filter((f) => !f.caption).map((f) => f.name);
  if (missing.length) throw new Error(`No caption for ${missing.join(", ")}`);
  return {
    uploads: local.map((f, position) => ({ name: f.name, position, caption: f.caption })),
    deletes: remote.map((p) => ({ id: p.id, imageUrl: p.image_url })),
  };
}

// AMO limits writes per user to 3 per minute, 10 per hour and 24 per day, in sliding
// windows shared with all add-on writes, the version submission included
// (addon_submission_throttles in src/olympia/api/throttling.py of mozilla/addons-server).
// A request rejected by one window still counts in the others. A sync with three
// screenshots makes 6 writes plus one DELETE per old preview, so after a release it runs
// into the hourly window and later writes wait for a slot.
const THROTTLE_RETRIES = 6;
const DEFAULT_THROTTLE_S = 60;
// One full hourly window plus slack. A longer wait means the daily limit, which no
// workflow step can sit out.
const MAX_THROTTLE_WAIT_MS = 61 * 60_000;

// AMO names the wait in Retry-After or in the detail text ("Expected available in 56 seconds").
// One second of slack, so the retry does not arrive just before the window opens.
function throttleDelayMs(res, text) {
  const header = Number(res.headers.get("Retry-After"));
  const match = /available in (\d+) seconds?/.exec(text);
  const seconds = header > 0 ? header : match ? Number(match[1]) : DEFAULT_THROTTLE_S;
  return (seconds + 1) * 1000;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {number} [options.deadline] epoch ms; a throttle wait that would end later fails at once,
 *   so the caller can still report before an outer timeout kills the process
 * @param {(line: string) => void} [options.log] receives one line per throttle wait
 */
export function createAmoClient({
  issuer,
  secret,
  addon,
  fetchImpl = globalThis.fetch,
  api = AMO_API,
  sleep = wait,
  log = console.log,
  now = Date.now,
  deadline = Infinity,
}) {
  const base = `${api}/addons/addon/${encodeURIComponent(addon)}`;

  async function call(method, url, body) {
    const path = url.replace(api, "");
    const json = body !== undefined && !(body instanceof FormData);
    if (json) body = JSON.stringify(body);
    for (let attempt = 0; ; attempt++) {
      // A fresh token per request, so long uploads and waits cannot outlive it.
      const headers = { Authorization: `JWT ${amoJwt(issuer, secret)}` };
      if (json) headers["Content-Type"] = "application/json";
      const res = await fetchImpl(url, { method, headers, body });
      const text = await res.text();
      const delay = res.status === 429 ? throttleDelayMs(res, text) : 0;
      if (delay && delay <= MAX_THROTTLE_WAIT_MS && now() + delay <= deadline && attempt < THROTTLE_RETRIES) {
        // A long silent wait would look like a hung run in the workflow log.
        log(`AMO throttled, waiting ${delay / 1000} s before ${method} ${path}`);
        await sleep(delay);
        continue;
      }
      if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
      return text ? JSON.parse(text) : {};
    }
  }

  return {
    async previews() {
      return (await call("GET", `${base}/`)).previews ?? [];
    },
    upload(fileName, data, position) {
      const form = new FormData();
      form.append("image", new Blob([data], { type: "image/png" }), fileName);
      form.append("position", String(position));
      return call("POST", `${base}/previews/`, form);
    },
    update(id, fields) {
      return call("PATCH", `${base}/previews/${id}/`, fields);
    },
    remove(id) {
      return call("DELETE", `${base}/previews/${id}/`);
    },
  };
}

/**
 * Uploads first and deletes afterwards, so the listing never runs empty. The
 * PATCH is needed because AMO cannot take the caption with the upload; it sets
 * the position again because the documented upload field name is inconsistent
 * ("postion").
 * If an upload or PATCH fails, the previews created in this run are removed
 * again, so the old set stays alone. That rollback is best effort: after a
 * throttle failure its DELETEs hit the same full window and fail too, and the
 * error names the previews left behind. If only deleting an old preview fails,
 * the new set is complete and stays; the error names the leftovers.
 */
export async function applyPreviewSync(client, plan, readFile, log = console.log) {
  const created = [];
  try {
    for (const u of plan.uploads) {
      const preview = await client.upload(u.name, readFile(u.name), u.position);
      created.push(preview.id);
      await client.update(preview.id, { position: u.position, caption: { "en-US": u.caption } });
      log(`Uploaded ${u.name} as preview ${preview.id} at position ${u.position}`);
    }
  } catch (err) {
    const leftovers = await removeAll(client, created, (id) => log(`Rolled back preview ${id}`));
    if (leftovers.length) err.message += `. Rollback failed, new previews left on the listing: ${leftovers.join("; ")}`;
    throw err;
  }
  const leftovers = await removeAll(
    client,
    plan.deletes.map((d) => d.id),
    (id) => log(`Deleted preview ${id}`),
  );
  if (leftovers.length) {
    throw new Error(`New previews are in place, but old previews are left on the listing: ${leftovers.join("; ")}`);
  }
}

// Best effort: keeps going after a failure and returns "id (reason)" per preview it could not remove.
async function removeAll(client, ids, onRemoved) {
  const failed = [];
  for (const id of ids) {
    try {
      await client.remove(id);
      onRemoved(id);
    } catch (err) {
      failed.push(`${id} (${err.message})`);
    }
  }
  return failed;
}
