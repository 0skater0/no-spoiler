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
  checkLocal(local);
  return {
    uploads: local.map((f, position) => ({ name: f.name, position, caption: f.caption })),
    deletes: remote.map((p) => ({ id: p.id, imageUrl: p.image_url })),
  };
}

/**
 * Plans PATCHes that set caption and position of the existing previews without
 * replacing images: the n-th remote preview gets the caption of the n-th local
 * screenshot. Only previews whose en-US caption or position differs are listed.
 * @param {{id: number, position: number, caption?: object | null}[]} remote previews in listing order,
 *   which AMO sorts by position
 * @param {{name: string, caption?: string}[]} local screenshots in display order
 */
export function planCaptionRepair(remote, local) {
  checkLocal(local);
  if (remote.length !== local.length) {
    throw new Error(
      `The listing has ${remote.length} previews, but there are ${local.length} local screenshots; run a full sync instead`,
    );
  }
  return local
    .map((f, position) => ({ id: remote[position].id, name: f.name, position, caption: f.caption }))
    .filter((u, i) => !previewMatches(remote[i], u));
}

function checkLocal(local) {
  if (!local.length) throw new Error("No local screenshots; refusing to empty the listing");
  const missing = local.filter((f) => !f.caption).map((f) => f.name);
  if (missing.length) throw new Error(`No caption for ${missing.join(", ")}`);
}

const previewMatches = (preview, { position, caption }) =>
  preview.position === position && preview.caption?.["en-US"] === caption;

// AMO limits writes per user to 3 per minute, 10 per hour and 24 per day, in sliding
// windows shared with all add-on writes, the version submission included
// (addon_submission_throttles in src/olympia/api/throttling.py of mozilla/addons-server).
// A request rejected by one window still counts in the others. A sync with three
// screenshots makes 6 writes (up to 9 when captions have to be set again) plus one
// DELETE per old preview, so after a release it runs into the hourly window and later
// writes wait for a slot. When the daily window is full, AMO names the time until its
// oldest write ages out, which can exceed an hour, so only the caller's deadline caps
// a wait.
const THROTTLE_RETRIES = 6;
const DEFAULT_THROTTLE_S = 60;

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
 *   so the caller can still report before an outer timeout kills the process. Without a
 *   deadline, nothing caps a wait.
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
      if (delay && now() + delay <= deadline && attempt < THROTTLE_RETRIES) {
        // A long silent wait would look like a hung run in the workflow log.
        log(`AMO throttled, waiting ${delay / 1000} s before ${method} ${path}`);
        await sleep(delay);
        continue;
      }
      if (!res.ok) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`), { status: res.status });
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

// After an upload, AMO resizes the image in a background task that loads the preview,
// sets its sizes and saves all fields, so a PATCH that lands before the task ends is
// overwritten. The empty sizes in the add-on detail show that the task has not finished.
const PREVIEW_POLL_MS = 3_000;
const RESIZE_TIMEOUT_MS = 3 * 60_000;

function previewTiming({ log = console.log, sleep = wait, pollMs = PREVIEW_POLL_MS, resizeTimeoutMs = RESIZE_TIMEOUT_MS }) {
  return { log, sleep, pollMs, resizeTimeoutMs };
}

const isResized = (preview) => preview?.image_size?.length > 0 && preview?.thumbnail_size?.length > 0;

// A client error other than a throttle does not go away by polling again.
const isTransient = (err) => !(err.status >= 400 && err.status < 500 && err.status !== 429);

/**
 * Polls the listing until the preview reports its image sizes. A read that fails with a
 * network error, a 5xx or a 429 counts as "not resized yet".
 * @param {boolean} [listed] the preview was already seen on the listing; right after the
 *   upload a lagging read may not list it yet, so only a preview seen before that is gone
 *   fails at once
 */
async function waitForResize(client, id, { log, sleep, pollMs, resizeTimeoutMs }, listed = false) {
  for (let waited = 0; ; waited += pollMs) {
    let previews = null;
    try {
      previews = await client.previews();
    } catch (err) {
      if (!isTransient(err)) throw err;
      log(`Reading the previews failed (${err.message}), trying again`);
    }
    if (previews) {
      const preview = previews.find((p) => p.id === id);
      if (isResized(preview)) return;
      if (preview) listed = true;
      else if (listed) throw new Error(`Preview ${id} is no longer on the listing`);
    }
    if (waited >= resizeTimeoutMs) throw new Error(`AMO did not finish resizing preview ${id} within ${resizeTimeoutMs / 1000} s`);
    if (!waited) log(`Waiting for AMO to resize preview ${id}`);
    await sleep(pollMs);
  }
}

/**
 * Reads the preview back after the PATCH and repeats it once, so a lost caption shows up
 * instead of a silently empty listing text. A preview that is gone, or still has a wrong
 * position after the second PATCH, throws: the captions-only repair pairs previews with
 * screenshots in listing order, which AMO sorts by position, so it cannot fix positions.
 * @returns {Promise<string | null>} null when position and caption stuck, else the caption
 *   AMO still lists
 */
async function updateAndVerify(client, { id, position, caption }, timing) {
  for (let attempt = 1; ; attempt++) {
    await client.update(id, { position, caption: { "en-US": caption } });
    // AMO reads from DB replicas and fetch keeps no pinning cookie, so an immediate read can see the old state.
    await timing.sleep(timing.pollMs);
    const preview = (await client.previews()).find((p) => p.id === id);
    if (!preview) throw new Error(`Preview ${id} is no longer on the listing`);
    if (previewMatches(preview, { position, caption })) return null;
    const found = `position ${preview.position}, caption ${JSON.stringify(preview.caption)}`;
    if (attempt === 2) {
      if (preview.position !== position) {
        throw new Error(`Preview ${id} did not keep position ${position} after two PATCHes (${found})`);
      }
      return `caption ${JSON.stringify(preview.caption)}`;
    }
    timing.log(`Preview ${id} did not keep position and caption (${found}), setting them again`);
    await waitForResize(client, id, timing, true);
  }
}

const wrongCaptionsMessage = (wrong) => `did not keep their caption after two PATCHes: ${wrong.join("; ")}`;

/**
 * Uploads first and deletes afterwards, so the listing never runs empty. The
 * PATCH is needed because AMO cannot take the caption with the upload; it sets
 * the position again because the documented upload field name is inconsistent
 * ("postion"). It waits for the resize of the upload, see waitForResize.
 * If an upload or PATCH request fails, a resize does not finish, or a preview
 * vanishes or keeps a wrong position, the previews created in this run are
 * removed again, so the old set stays alone. That rollback is best effort:
 * after a throttle failure its DELETEs hit the same full window and fail too,
 * and the error names the previews left behind. A preview at the right position
 * whose caption does not stick keeps the new images: the sync finishes and the
 * error names the previews for the captions-only repair. If only deleting an
 * old preview fails, the new set is complete and stays; the error names the leftovers.
 * @param {{log?: (line: string) => void, sleep?: (ms: number) => Promise<void>, pollMs?: number, resizeTimeoutMs?: number}} [options]
 */
export async function applyPreviewSync(client, plan, readFile, options = {}) {
  const timing = previewTiming(options);
  const { log } = timing;
  const created = [];
  const wrongCaptions = [];
  try {
    for (const u of plan.uploads) {
      const preview = await client.upload(u.name, readFile(u.name), u.position);
      created.push(preview.id);
      await waitForResize(client, preview.id, timing);
      const found = await updateAndVerify(client, { id: preview.id, position: u.position, caption: u.caption }, timing);
      if (found) wrongCaptions.push(`${preview.id} (${u.name}, ${found})`);
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
  const problems = [];
  if (wrongCaptions.length) {
    problems.push(`New images are in place, but these previews ${wrongCaptionsMessage(wrongCaptions)}. Run the captions-only repair to set them`);
  }
  if (leftovers.length) problems.push(`New previews are in place, but old previews are left on the listing: ${leftovers.join("; ")}`);
  if (problems.length) throw new Error(problems.join(". "));
}

/**
 * Applies planCaptionRepair: one verified PATCH per listed preview, nothing is uploaded or deleted.
 * A preview whose caption does not stick does not stop the others; the error names all of them.
 * Any other failure stops the repair, and its error still names the caption failures so far.
 * @param {{log?: (line: string) => void, sleep?: (ms: number) => Promise<void>, pollMs?: number, resizeTimeoutMs?: number}} [options]
 */
export async function applyCaptionRepair(client, updates, options = {}) {
  const timing = previewTiming(options);
  const wrong = [];
  for (const u of updates) {
    try {
      // A preview from a sync that just failed may still be in the resize.
      await waitForResize(client, u.id, timing, true);
      const found = await updateAndVerify(client, u, timing);
      if (found) wrong.push(`${u.id} (${u.name}, ${found})`);
      else timing.log(`Set caption and position ${u.position} of preview ${u.id} (${u.name})`);
    } catch (err) {
      if (wrong.length) err.message += `. Before that, these previews ${wrongCaptionsMessage(wrong)}`;
      throw err;
    }
  }
  if (wrong.length) throw new Error(`These previews ${wrongCaptionsMessage(wrong)}`);
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
