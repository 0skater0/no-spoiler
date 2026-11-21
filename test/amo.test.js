// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  AMO_API,
  amoJwt,
  applyCaptionRepair,
  applyPreviewSync,
  createAmoClient,
  planCaptionRepair,
  planPreviewSync,
} from "../scripts/lib/amo.mjs";
import { escapeCommandData } from "../scripts/lib/gh-actions.mjs";

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("AMO JWT", () => {
  it("builds an HS256 token with iss, jti, iat and a short exp", () => {
    const token = amoJwt("user:1:2", "s3cret", { now: 1_700_000_000_500, jti: "abc" });
    const [header, payload, signature] = token.split(".");
    expect(decode(header)).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = decode(payload);
    expect(claims).toMatchObject({ iss: "user:1:2", jti: "abc", iat: 1_700_000_000 });
    expect(claims.exp - claims.iat).toBeGreaterThan(0);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);
    expect(signature).toBe(createHmac("sha256", "s3cret").update(`${header}.${payload}`).digest("base64url"));
  });

  it("uses a new jti for every token", () => {
    const jti = (t) => decode(t.split(".")[1]).jti;
    expect(jti(amoJwt("i", "s"))).not.toBe(jti(amoJwt("i", "s")));
  });
});

describe("preview sync plan", () => {
  const local = [
    { name: "screenshot-1.png", caption: "One" },
    { name: "screenshot-2.png", caption: "Two" },
  ];

  it("uploads all local screenshots in order and deletes all old previews", () => {
    const plan = planPreviewSync([{ id: 7, image_url: "a" }, { id: 9, image_url: "b" }], local);
    expect(plan.uploads).toEqual([
      { name: "screenshot-1.png", position: 0, caption: "One" },
      { name: "screenshot-2.png", position: 1, caption: "Two" },
    ]);
    expect(plan.deletes.map((d) => d.id)).toEqual([7, 9]);
  });

  it("refuses to empty the listing", () => {
    expect(() => planPreviewSync([{ id: 7 }], [])).toThrow(/refusing/);
  });

  it("requires a caption for every screenshot", () => {
    expect(() => planPreviewSync([], [{ name: "x.png" }])).toThrow(/x\.png/);
  });
});

function mockFetch(handler) {
  return vi.fn(async (url, init) => {
    const { status = 200, body = {}, headers } = handler(url, init) ?? {};
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  });
}

describe("AMO client throttling", () => {
  const addon = "{d27fe5e6-f507-492e-b030-1a17debff539}";
  const throttled = (seconds) => ({
    status: 429,
    body: { detail: `Request was throttled. Expected available in ${seconds} seconds.` },
  });

  it("waits the time AMO names and repeats the request", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => (++calls === 1 ? throttled(56) : { status: 201, body: { id: 5 } }));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log: () => {} });
    expect(await client.upload("a.png", Buffer.alloc(1), 0)).toEqual({ id: 5 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(57_000);
  });

  it("prefers the Retry-After header", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() =>
      ++calls === 1 ? { ...throttled(56), headers: { "Retry-After": "3" } } : { status: 204 },
    );
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log: () => {} });
    await client.remove(7);
    expect(sleep).toHaveBeenCalledWith(4_000);
  });

  it("waits a minute when AMO names no time", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => (++calls === 1 ? { status: 429, body: {} } : { status: 204 }));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log: () => {} });
    await client.remove(7);
    expect(sleep).toHaveBeenCalledWith(61_000);
  });

  it("sits out several long throttle windows in a row and logs each wait", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => (++calls === 1 ? throttled(839) : calls === 2 ? throttled(3599) : { status: 204 }));
    const sleep = vi.fn(async () => {});
    const log = vi.fn();
    const client = createAmoClient({ issuer: "s3cret-issuer", secret: "s3cret", addon, fetchImpl, sleep, log });
    await client.remove(7);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 840_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 3_600_000);
    const path = `/addons/addon/${encodeURIComponent(addon)}/previews/7/`;
    expect(log.mock.calls).toEqual([
      [`AMO throttled, waiting 840 s before DELETE ${path}`],
      [`AMO throttled, waiting 3600 s before DELETE ${path}`],
    ]);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/s3cret|JWT/);
  });

  it("sits out a wait of more than an hour within the budget", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => (++calls === 1 ? throttled(3729) : { status: 204 }));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log: () => {} });
    await client.remove(7);
    expect(sleep).toHaveBeenCalledWith(3_730_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fails at once on a wait far beyond the budget, as a full daily window can name", async () => {
    const fetchImpl = mockFetch(() => throttled(80_000));
    const sleep = vi.fn(async () => {});
    const log = vi.fn();
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log, deadline: Date.now() + 170 * 60_000 });
    await expect(client.remove(7)).rejects.toThrow(/429.*80000/);
    expect(sleep).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  describe("time budget", () => {
    const now = () => 1_000_000;
    const budgetClient = (fetchImpl, sleep, log, budgetMs) =>
      createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log, now, deadline: now() + budgetMs });

    it("waits when the window opens right at the deadline", async () => {
      let calls = 0;
      const fetchImpl = mockFetch(() => (++calls === 1 ? throttled(839) : { status: 204 }));
      const sleep = vi.fn(async () => {});
      const log = vi.fn();
      await budgetClient(fetchImpl, sleep, log, 840_000).remove(7);
      expect(sleep).toHaveBeenCalledWith(840_000);
      expect(log).toHaveBeenCalledTimes(1);
    });

    it("fails at once without logging when the wait would run past the deadline", async () => {
      const fetchImpl = mockFetch(() => throttled(839));
      const sleep = vi.fn(async () => {});
      const log = vi.fn();
      await expect(budgetClient(fetchImpl, sleep, log, 839_999).remove(7)).rejects.toThrow(/429.*839/);
      expect(sleep).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });
  });

  it("gives up after six throttled retries", async () => {
    const fetchImpl = mockFetch(() => throttled(1));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep, log: () => {} });
    await expect(client.remove(7)).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(7);
  });
});

// Stand-in for the AMO add-on endpoints. Like the resize task of AMO, finishing the resize
// of an upload saves the preview as loaded at upload time, so an earlier PATCH is lost.
// Previews listed in stillResizing start in that state too. Like AMO, the listing is sorted
// by position.
function fakeAmo({ initial = [], stillResizing = [], resizePolls = 0, lostPatches = 0, override } = {}) {
  let next = 100;
  const resized = { image_size: [1280, 800], thumbnail_size: [533, 333] };
  const previews = new Map(initial.map((p) => [p.id, { caption: null, ...resized, ...p }]));
  const resizing = new Map();
  for (const id of stillResizing) {
    Object.assign(previews.get(id), { image_size: [], thumbnail_size: [] });
    resizing.set(id, { pollsLeft: resizePolls, loaded: { ...previews.get(id) } });
  }
  const fetchImpl = mockFetch((url, init) => {
    const res = override?.(url, init, next);
    if (res) return res;
    const id = Number(/\/previews\/(\d+)\/$/.exec(url)?.[1]);
    if (init.method === "POST") {
      const p = { id: next++, position: Number(init.body.get("position")), caption: null, image_size: [], thumbnail_size: [] };
      previews.set(p.id, p);
      resizing.set(p.id, { pollsLeft: resizePolls, loaded: { ...p } });
      return { status: 201, body: p };
    }
    if (init.method === "PATCH") {
      if (lostPatches-- <= 0) Object.assign(previews.get(id), JSON.parse(init.body));
      return { body: previews.get(id) };
    }
    if (init.method === "DELETE") {
      previews.delete(id);
      return { status: 204 };
    }
    for (const [pid, job] of resizing) {
      if (job.pollsLeft-- > 0) continue;
      if (previews.has(pid)) previews.set(pid, { ...job.loaded, ...resized });
      resizing.delete(pid);
    }
    return { body: { previews: [...previews.values()].sort((a, b) => a.position - b.position) } };
  });
  return { fetchImpl, previews };
}

describe("AMO client and sync", () => {
  const addon = "{d27fe5e6-f507-492e-b030-1a17debff539}";
  const base = `${AMO_API}/addons/addon/${encodeURIComponent(addon)}`;
  const amoClient = (fetchImpl) => createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
  const quiet = { log: () => {}, sleep: async () => {} };
  const callLog = (fetchImpl) => fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.replace(base, "")}`);
  const writes = (fetchImpl) => callLog(fetchImpl).filter((c) => !c.startsWith("GET"));
  const twoScreenshots = [
    { name: "a.png", caption: "A" },
    { name: "b.png", caption: "B" },
  ];

  it("reads the previews with a JWT header", async () => {
    const fetchImpl = mockFetch(() => ({ body: { previews: [{ id: 1 }] } }));
    expect(await amoClient(fetchImpl).previews()).toEqual([{ id: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${base}/`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("uploads, then sets position and caption, and deletes the old previews last", async () => {
    const { fetchImpl, previews } = fakeAmo({ initial: [{ id: 7, position: 0 }] });
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    await applyPreviewSync(amoClient(fetchImpl), plan, (name) => Buffer.from(name), quiet);

    expect(writes(fetchImpl)).toEqual([
      "POST /previews/",
      "PATCH /previews/100/",
      "POST /previews/",
      "PATCH /previews/101/",
      "DELETE /previews/7/",
    ]);
    const upload = fetchImpl.mock.calls[0][1].body;
    expect(upload.get("position")).toBe("0");
    expect(upload.get("image").name).toBe("a.png");
    const patch = fetchImpl.mock.calls.filter(([, init]) => init.method === "PATCH")[1][1];
    expect(patch.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(patch.body)).toEqual({ position: 1, caption: { "en-US": "B" } });
    expect([...previews.values()].map((p) => [p.id, p.position, p.caption])).toEqual([
      [100, 0, { "en-US": "A" }],
      [101, 1, { "en-US": "B" }],
    ]);
  });

  it("waits for the resize of an upload before the PATCH, so the caption is not overwritten", async () => {
    const { fetchImpl, previews } = fakeAmo({ resizePolls: 2 });
    const sleep = vi.fn(async () => {});
    const log = vi.fn();
    const plan = planPreviewSync([], [{ name: "a.png", caption: "A" }]);
    await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), { log, sleep, pollMs: 2_000 });

    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "GET /", "GET /", "GET /", "PATCH /previews/100/", "GET /"]);
    expect(previews.get(100).caption).toEqual({ "en-US": "A" });
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(log.mock.calls).toEqual([["Waiting for AMO to resize preview 100"], ["Uploaded a.png as preview 100 at position 0"]]);
  });

  it("sets position and caption again when they did not stick", async () => {
    const { fetchImpl, previews } = fakeAmo({ lostPatches: 1 });
    const log = vi.fn();
    const plan = planPreviewSync([], [{ name: "a.png", caption: "A" }]);
    await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), { ...quiet, log });

    expect(writes(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "PATCH /previews/100/"]);
    expect(previews.get(100).caption).toEqual({ "en-US": "A" });
    expect(log.mock.calls[0][0]).toMatch(/^Preview 100 did not keep position and caption \(position 0, caption null\)/);
  });

  it("keeps the new images when a caption is lost twice, deletes the old ones and then fails", async () => {
    const { fetchImpl, previews } = fakeAmo({
      initial: [
        { id: 7, position: 0 },
        { id: 8, position: 1 },
      ],
      lostPatches: 2,
    });
    const plan = planPreviewSync([{ id: 7 }, { id: 8 }], twoScreenshots);
    const err = await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet).catch((e) => e);
    expect(err.message).toBe(
      "New images are in place, but these previews did not keep their caption after two PATCHes: " +
        "100 (a.png, caption null). Run the captions-only repair to set them",
    );
    expect(writes(fetchImpl)).toEqual([
      "POST /previews/",
      "PATCH /previews/100/",
      "PATCH /previews/100/",
      "POST /previews/",
      "PATCH /previews/101/",
      "DELETE /previews/7/",
      "DELETE /previews/8/",
    ]);
    expect([...previews.values()].map((p) => [p.id, p.caption])).toEqual([
      [100, null],
      [101, { "en-US": "B" }],
    ]);
  });

  it("rolls back and keeps the old previews when a preview is gone after the second PATCH", async () => {
    let patches = 0;
    const { fetchImpl, previews } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      lostPatches: 1,
      override: (url, init) => {
        if (init.method === "PATCH") patches++;
        return init.method === "GET" && patches === 2 ? { body: { previews: [] } } : null;
      },
    });
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(
      /^Preview 100 is no longer on the listing$/,
    );
    expect(writes(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "PATCH /previews/100/", "DELETE /previews/100/"]);
    expect([...previews.keys()]).toEqual([7]);
  });

  it("rolls back when the position is still wrong after two PATCHes, even with the right caption", async () => {
    // The PATCH takes the caption, but AMO lists the preview at another position.
    const amo = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      override: (url, init) => {
        if (init.method !== "PATCH") return null;
        const preview = Object.assign(amo.previews.get(100), { caption: JSON.parse(init.body).caption, position: 3 });
        return { body: preview };
      },
    });
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(amo.fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(
      'Preview 100 did not keep position 0 after two PATCHes (position 3, caption {"en-US":"A"})',
    );
    expect(writes(amo.fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "PATCH /previews/100/", "DELETE /previews/100/"]);
    expect([...amo.previews.keys()]).toEqual([7]);
  });

  it("names both wrong captions and old leftovers", async () => {
    const { fetchImpl } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      lostPatches: 2,
      override: (url, init) => (init.method === "DELETE" ? { status: 500, body: "boom" } : null),
    });
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(
      /captions-only repair to set them\. New previews are in place, but old previews are left on the listing: 7 \(DELETE/,
    );
  });

  it("keeps polling after a failed read of the previews", async () => {
    let gets = 0;
    const { fetchImpl, previews } = fakeAmo({
      resizePolls: 1,
      override: (url, init) => {
        if (init.method !== "GET") return null;
        if (++gets === 1) throw new TypeError("fetch failed");
        return gets === 2 ? { status: 503, body: "down" } : null;
      },
    });
    const log = vi.fn();
    const plan = planPreviewSync([], [{ name: "a.png", caption: "A" }]);
    await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), { ...quiet, log });

    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "GET /", "GET /", "GET /", "GET /", "PATCH /previews/100/", "GET /"]);
    expect(previews.get(100).caption).toEqual({ "en-US": "A" });
    expect(log.mock.calls.flat().filter((l) => l.startsWith("Reading the previews failed"))).toHaveLength(2);
  });

  it("fails at once on a client error while reading the previews", async () => {
    const { fetchImpl } = fakeAmo({
      override: (url, init) => (init.method === "GET" ? { status: 401, body: { detail: "bad token" } } : null),
    });
    const sleep = vi.fn(async () => {});
    const plan = planPreviewSync([], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), { log: () => {}, sleep })).rejects.toThrow(
      /GET .*: 401/,
    );
    expect(sleep).not.toHaveBeenCalled();
    expect(writes(fetchImpl)).toEqual(["POST /previews/", "DELETE /previews/100/"]);
  });

  it("fails at once when the preview vanishes from the listing while it waits", async () => {
    let gets = 0;
    const { fetchImpl } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      resizePolls: Infinity,
      override: (url, init) => (init.method === "GET" && ++gets === 2 ? { body: { previews: [] } } : null),
    });
    const sleep = vi.fn(async () => {});
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), { log: () => {}, sleep })).rejects.toThrow(
      "Preview 100 is no longer on the listing",
    );
    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "GET /", "GET /", "DELETE /previews/100/"]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("waits for an upload that a lagging read does not list yet", async () => {
    let gets = 0;
    const { fetchImpl, previews } = fakeAmo({
      override: (url, init) => (init.method === "GET" && ++gets === 1 ? { body: { previews: [] } } : null),
    });
    const plan = planPreviewSync([], [{ name: "a.png", caption: "A" }]);
    await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet);
    expect(previews.get(100).caption).toEqual({ "en-US": "A" });
  });

  it("gives up on a resize that does not finish and rolls back", async () => {
    const { fetchImpl, previews } = fakeAmo({ initial: [{ id: 7, position: 0 }], resizePolls: Infinity });
    const sleep = vi.fn(async () => {});
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    const options = { log: () => {}, sleep, pollMs: 1_000, resizeTimeoutMs: 3_000 };
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), options)).rejects.toThrow(
      /did not finish resizing preview 100 within 3 s/,
    );
    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "GET /", "GET /", "GET /", "GET /", "DELETE /previews/100/"]);
    expect(sleep).toHaveBeenCalledTimes(3);
    expect([...previews.keys()]).toEqual([7]);
  });

  it("deletes nothing when an upload fails", async () => {
    const { fetchImpl } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      override: (url, init) => (init.method === "POST" ? { status: 400, body: { image: ["bad"] } } : null),
    });
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(/400/);
    expect(writes(fetchImpl)).toEqual(["POST /previews/"]);
  });

  it("removes the previews of this run when a later upload fails, and keeps the old ones", async () => {
    const { fetchImpl } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      override: (url, init, next) => (init.method === "POST" && next === 101 ? { status: 500, body: "boom" } : null),
    });
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(/POST .*: 500/);
    expect(writes(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "POST /previews/", "DELETE /previews/100/"]);
  });

  it("removes the uploaded preview when its PATCH fails, and names rollback failures", async () => {
    const { fetchImpl } = fakeAmo({
      initial: [{ id: 7, position: 0 }],
      override: (url, init) => {
        if (init.method === "PATCH") return { status: 400, body: { caption: ["bad"] } };
        if (init.method === "DELETE") return { status: 503, body: "down" };
        return null;
      },
    });
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    const err = await applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet).catch((e) => e);
    expect(err.message).toMatch(/^PATCH .*: 400/);
    expect(err.message).toMatch(/Rollback failed, new previews left on the listing: 100 \(DELETE .*503/);
    expect(writes(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "DELETE /previews/100/"]);
  });

  it("keeps the new previews when deleting an old one fails, tries the rest and reports the leftovers", async () => {
    const { fetchImpl } = fakeAmo({
      initial: [
        { id: 7, position: 0 },
        { id: 8, position: 1 },
      ],
      override: (url, init) => (init.method === "DELETE" && url.endsWith("/7/") ? { status: 500, body: "boom" } : null),
    });
    const plan = planPreviewSync([{ id: 7 }, { id: 8 }], twoScreenshots);
    await expect(applyPreviewSync(amoClient(fetchImpl), plan, () => Buffer.alloc(1), quiet)).rejects.toThrow(
      /New previews are in place, but old previews are left on the listing: 7 \(DELETE/,
    );
    expect(writes(fetchImpl)).toEqual([
      "POST /previews/",
      "PATCH /previews/100/",
      "POST /previews/",
      "PATCH /previews/101/",
      "DELETE /previews/7/",
      "DELETE /previews/8/",
    ]);
  });
});

describe("caption repair", () => {
  const addon = "{d27fe5e6-f507-492e-b030-1a17debff539}";
  const local = [
    { name: "a.png", caption: "A" },
    { name: "b.png", caption: "B" },
    { name: "c.png", caption: "C" },
  ];
  const remote = [
    { id: 11, position: 0, caption: { "en-US": "A" } },
    { id: 12, position: 1, caption: null },
    { id: 13, position: 1, caption: { "en-US": "C" } },
  ];

  it("plans a PATCH only for previews whose caption or position differs, in listing order", () => {
    expect(planCaptionRepair(remote, local)).toEqual([
      { id: 12, name: "b.png", position: 1, caption: "B" },
      { id: 13, name: "c.png", position: 2, caption: "C" },
    ]);
  });

  it("plans nothing when all previews match", () => {
    const matching = local.map((f, i) => ({ id: i, position: i, caption: { "en-US": f.caption } }));
    expect(planCaptionRepair(matching, local)).toEqual([]);
  });

  it("refuses when the number of previews differs from the screenshots", () => {
    expect(() => planCaptionRepair(remote.slice(0, 2), local)).toThrow(/2 previews, but there are 3 local screenshots/);
  });

  it("requires a caption for every screenshot", () => {
    expect(() => planCaptionRepair(remote, [...local.slice(0, 2), { name: "c.png" }])).toThrow(/c\.png/);
  });

  it("patches only the planned previews and verifies them", async () => {
    const { fetchImpl, previews } = fakeAmo({ initial: remote, lostPatches: 1 });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const log = vi.fn();
    await applyCaptionRepair(client, planCaptionRepair(remote, local), { log, sleep: async () => {} });
    const methods = fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.split("/previews")[1] ?? "/"}`);
    expect(methods.filter((m) => !m.startsWith("GET"))).toEqual(["PATCH /12/", "PATCH /12/", "PATCH /13/"]);
    expect([...previews.values()].map((p) => [p.id, p.position, p.caption?.["en-US"]])).toEqual([
      [11, 0, "A"],
      [12, 1, "B"],
      [13, 2, "C"],
    ]);
    expect(log).toHaveBeenCalledWith("Set caption and position 2 of preview 13 (c.png)");
  });

  const repairCalls = (fetchImpl) => fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.split("/previews")[1] ?? "/"}`);

  it("waits for a resize that is still running before the PATCH", async () => {
    const { fetchImpl, previews } = fakeAmo({ initial: remote, stillResizing: [12], resizePolls: 2 });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const log = vi.fn();
    await applyCaptionRepair(client, planCaptionRepair(remote, local).slice(0, 1), { log, sleep: async () => {} });
    expect(repairCalls(fetchImpl)).toEqual(["GET /", "GET /", "GET /", "PATCH /12/", "GET /"]);
    expect(previews.get(12).caption).toEqual({ "en-US": "B" });
    expect(log).toHaveBeenCalledWith("Waiting for AMO to resize preview 12");
  });

  it("goes on with the other previews when a caption is lost twice and then fails, without uploads or deletes", async () => {
    const { fetchImpl, previews } = fakeAmo({ initial: remote, lostPatches: 2 });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const err = await applyCaptionRepair(client, planCaptionRepair(remote, local), { log: () => {}, sleep: async () => {} }).catch(
      (e) => e,
    );
    expect(err.message).toBe("These previews did not keep their caption after two PATCHes: 12 (b.png, caption null)");
    expect(repairCalls(fetchImpl).filter((m) => !m.startsWith("GET"))).toEqual(["PATCH /12/", "PATCH /12/", "PATCH /13/"]);
    expect(previews.get(13)).toMatchObject({ position: 2, caption: { "en-US": "C" } });
  });

  it("still names the caption failures so far when a later preview fails", async () => {
    const { fetchImpl } = fakeAmo({
      initial: remote,
      lostPatches: 2,
      override: (url, init) => (init.method === "PATCH" && url.endsWith("/13/") ? { status: 500, body: "boom" } : null),
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const err = await applyCaptionRepair(client, planCaptionRepair(remote, local), { log: () => {}, sleep: async () => {} }).catch(
      (e) => e,
    );
    expect(err.message).toMatch(
      /^PATCH .*\/13\/: 500 .*\. Before that, these previews did not keep their caption after two PATCHes: 12 \(b\.png, caption null\)$/,
    );
  });

  it("pairs the screenshots with the listing as AMO sorts it, by position", async () => {
    // Upload order put a.png into preview 21 and b.png into 22, but their positions are swapped.
    const { fetchImpl } = fakeAmo({
      initial: [
        { id: 21, position: 1, caption: { "en-US": "A" } },
        { id: 22, position: 0, caption: { "en-US": "B" } },
      ],
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const listing = await client.previews();
    expect(listing.map((p) => p.id)).toEqual([22, 21]);
    expect(planCaptionRepair(listing, local.slice(0, 2))).toEqual([
      { id: 22, name: "a.png", position: 0, caption: "A" },
      { id: 21, name: "b.png", position: 1, caption: "B" },
    ]);
  });
});

describe("GitHub Actions command data", () => {
  it("escapes percent signs and line breaks", () => {
    expect(escapeCommandData("100% done\r\nnext\nline")).toBe("100%25 done%0D%0Anext%0Aline");
  });

  it("leaves plain text alone", () => {
    expect(escapeCommandData("POST /previews/: 500 boom")).toBe("POST /previews/: 500 boom");
  });
});
