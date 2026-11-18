// @vitest-environment node
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AMO_API, amoJwt, applyPreviewSync, createAmoClient, planPreviewSync } from "../scripts/lib/amo.mjs";
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
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep });
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
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep });
    await client.remove(7);
    expect(sleep).toHaveBeenCalledWith(4_000);
  });

  it("waits a minute when AMO names no time", async () => {
    let calls = 0;
    const fetchImpl = mockFetch(() => (++calls === 1 ? { status: 429, body: {} } : { status: 204 }));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep });
    await client.remove(7);
    expect(sleep).toHaveBeenCalledWith(61_000);
  });

  it("fails at once instead of sleeping through a long throttle window", async () => {
    const fetchImpl = mockFetch(() => ({ ...throttled(3600), headers: { "Retry-After": "3600" } }));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep });
    await expect(client.remove(7)).rejects.toThrow(/429.*3600/);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives up after a few throttled attempts", async () => {
    const fetchImpl = mockFetch(() => throttled(1));
    const sleep = vi.fn(async () => {});
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl, sleep });
    await expect(client.remove(7)).rejects.toThrow(/429/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("AMO client and sync", () => {
  const addon = "{d27fe5e6-f507-492e-b030-1a17debff539}";
  const base = `${AMO_API}/addons/addon/${encodeURIComponent(addon)}`;

  it("reads the previews with a JWT header", async () => {
    const fetchImpl = mockFetch(() => ({ body: { previews: [{ id: 1 }] } }));
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    expect(await client.previews()).toEqual([{ id: 1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${base}/`);
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("uploads, then sets position and caption, and deletes the old previews last", async () => {
    let next = 100;
    const fetchImpl = mockFetch((url, init) => {
      if (init.method === "POST") return { status: 201, body: { id: next++ } };
      if (init.method === "DELETE") return { status: 204 };
      return { body: {} };
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const plan = planPreviewSync(
      [{ id: 7 }],
      [
        { name: "a.png", caption: "A" },
        { name: "b.png", caption: "B" },
      ],
    );
    await applyPreviewSync(client, plan, (name) => Buffer.from(name), () => {});

    const calls = fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.replace(base, "")}`);
    expect(calls).toEqual([
      "POST /previews/",
      "PATCH /previews/100/",
      "POST /previews/",
      "PATCH /previews/101/",
      "DELETE /previews/7/",
    ]);
    const upload = fetchImpl.mock.calls[0][1].body;
    expect(upload.get("position")).toBe("0");
    expect(upload.get("image").name).toBe("a.png");
    const patch = fetchImpl.mock.calls[3][1];
    expect(patch.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(patch.body)).toEqual({ position: 1, caption: { "en-US": "B" } });
  });

  it("deletes nothing when an upload fails", async () => {
    const fetchImpl = mockFetch((url, init) => (init.method === "POST" ? { status: 400, body: { image: ["bad"] } } : {}));
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const plan = planPreviewSync([{ id: 7 }], [{ name: "a.png", caption: "A" }]);
    await expect(applyPreviewSync(client, plan, () => Buffer.alloc(1), () => {})).rejects.toThrow(/400/);
    expect(fetchImpl.mock.calls.some(([, init]) => init.method === "DELETE")).toBe(false);
  });

  const twoScreenshots = [
    { name: "a.png", caption: "A" },
    { name: "b.png", caption: "B" },
  ];
  const callLog = (fetchImpl) => fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.replace(base, "")}`);

  it("removes the previews of this run when a later upload fails, and keeps the old ones", async () => {
    let next = 100;
    const fetchImpl = mockFetch((url, init) => {
      if (init.method === "POST") return next === 101 ? { status: 500, body: "boom" } : { status: 201, body: { id: next++ } };
      if (init.method === "DELETE") return { status: 204 };
      return { body: {} };
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    await expect(applyPreviewSync(client, plan, () => Buffer.alloc(1), () => {})).rejects.toThrow(/POST .*: 500/);
    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "POST /previews/", "DELETE /previews/100/"]);
  });

  it("removes the uploaded preview when its PATCH fails, and names rollback failures", async () => {
    const fetchImpl = mockFetch((url, init) => {
      if (init.method === "POST") return { status: 201, body: { id: 100 } };
      if (init.method === "PATCH") return { status: 400, body: { caption: ["bad"] } };
      return { status: 503, body: "down" };
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const plan = planPreviewSync([{ id: 7 }], twoScreenshots);
    const err = await applyPreviewSync(client, plan, () => Buffer.alloc(1), () => {}).catch((e) => e);
    expect(err.message).toMatch(/^PATCH .*: 400/);
    expect(err.message).toMatch(/Rollback failed, new previews left on the listing: 100 \(DELETE .*503/);
    expect(callLog(fetchImpl)).toEqual(["POST /previews/", "PATCH /previews/100/", "DELETE /previews/100/"]);
  });

  it("keeps the new previews when deleting an old one fails, tries the rest and reports the leftovers", async () => {
    let next = 100;
    const fetchImpl = mockFetch((url, init) => {
      if (init.method === "POST") return { status: 201, body: { id: next++ } };
      if (init.method === "DELETE") return url.endsWith("/7/") ? { status: 500, body: "boom" } : { status: 204 };
      return { body: {} };
    });
    const client = createAmoClient({ issuer: "i", secret: "s", addon, fetchImpl });
    const plan = planPreviewSync([{ id: 7 }, { id: 8 }], twoScreenshots);
    await expect(applyPreviewSync(client, plan, () => Buffer.alloc(1), () => {})).rejects.toThrow(
      /New previews are in place, but old previews are left on the listing: 7 \(DELETE/,
    );
    expect(callLog(fetchImpl)).toEqual([
      "POST /previews/",
      "PATCH /previews/100/",
      "POST /previews/",
      "PATCH /previews/101/",
      "DELETE /previews/7/",
      "DELETE /previews/8/",
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
