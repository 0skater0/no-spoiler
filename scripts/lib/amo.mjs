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

export function createAmoClient({ issuer, secret, addon, fetchImpl = globalThis.fetch, api = AMO_API }) {
  const base = `${api}/addons/addon/${encodeURIComponent(addon)}`;

  async function call(method, url, body) {
    // A fresh token per request, so long uploads cannot outlive it.
    const headers = { Authorization: `JWT ${amoJwt(issuer, secret)}` };
    if (body !== undefined && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const res = await fetchImpl(url, { method, headers, body });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${url.replace(api, "")}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
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
 * position is set again by PATCH because the documented upload field name is
 * inconsistent ("postion").
 * If an upload or PATCH fails, the previews created in this run are removed
 * again, so the old set stays alone. If only deleting an old preview fails, the
 * new set is complete and stays; the error names the leftovers.
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
