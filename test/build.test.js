import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GECKO_ID, build } from "../scripts/build.mjs";
import { discoverPlatforms, validate } from "../scripts/lib/platforms.mjs";
import { SRC } from "./helpers/env.js";

let outRoot;
const built = {};

beforeAll(async () => {
  outRoot = await mkdtemp(path.join(os.tmpdir(), "ns-build-"));
  for (const b of ["firefox", "chrome"]) built[b] = await build(b, outRoot);
});
afterAll(() => rm(outRoot, { recursive: true, force: true }));

function referencedFiles(m) {
  const files = new Set();
  Object.values(m.icons).forEach((f) => files.add(f));
  Object.values(m.action.default_icon).forEach((f) => files.add(f));
  files.add(m.action.default_popup);
  files.add(m.options_ui.page);
  for (const cs of m.content_scripts || []) [...cs.js, ...cs.css].forEach((f) => files.add(f));
  files.add("options/options.html");
  (m.background.scripts || []).forEach((f) => files.add(f));
  if (m.background.service_worker) files.add(m.background.service_worker);
  return [...files];
}

describe("manifests", () => {
  it("Firefox: event page, gecko id kept, no service worker", () => {
    const m = built.firefox.manifest;
    expect(m.manifest_version).toBe(3);
    expect(m.background.scripts).toBeDefined();
    expect(m.background.service_worker).toBeUndefined();
    expect(m.browser_specific_settings.gecko.id).toBe(GECKO_ID);
    expect(m.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ["none"] });
  });

  it("Chrome: service worker, no Firefox keys", () => {
    const m = built.chrome.manifest;
    expect(m.background).toEqual({ service_worker: "background/service-worker.js" });
    expect(m.browser_specific_settings).toBeUndefined();
    const sw = readFileSync(path.join(built.chrome.out, "background/service-worker.js"), "utf8");
    expect(sw).toContain('"/background/background.js"');
  });

  it("uses shortcuts each browser accepts", () => {
    const ff = built.firefox.manifest.commands["toggle-addon"].suggested_key;
    const cr = built.chrome.manifest.commands["toggle-addon"].suggested_key;
    expect(ff.default).toBe("Ctrl+Alt+U"); // unchanged from 0.9.x
    // Chrome refuses to load extensions with Ctrl+Alt shortcuts.
    for (const k of Object.values(cr)) expect(k).not.toMatch(/Ctrl\+Alt|Alt\+Ctrl/);
  });

  it("is newer than the last MV2 release", () => {
    const [major] = built.firefox.manifest.version.split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(1);
  });

  it("requests only the needed permissions", async () => {
    const platforms = await discoverPlatforms(SRC);
    for (const m of [built.firefox.manifest, built.chrome.manifest]) {
      expect(m.permissions.sort()).toEqual(["activeTab", "scripting", "storage"]);
      const required = platforms.filter((p) => p.hostAccess === "required").flatMap((p) => p.matches);
      expect(m.host_permissions ?? []).toEqual(required);
      expect(m.optional_host_permissions).toEqual(platforms.filter((p) => p.hostAccess === "optional").flatMap((p) => p.matches));
      expect(m.web_accessible_resources).toBeUndefined();
      // Optional platforms must not have static content scripts (they would imply host access).
      const staticMatches = (m.content_scripts || []).flatMap((c) => c.matches);
      for (const o of m.optional_host_permissions) expect(staticMatches).not.toContain(o);
    }
  });

  it("references only files that exist", () => {
    for (const b of ["firefox", "chrome"]) {
      const { out, manifest } = built[b];
      for (const f of referencedFiles(manifest)) expect(existsSync(path.join(out, f)), `${b}: ${f}`).toBe(true);
      for (const p of JSON.parse(readFileSync(path.join(out, "core/platforms.generated.js"), "utf8").match(/registerPlatforms\(([\s\S]*)\);/)[1])) {
        for (const f of [...p.contentFiles.js, ...p.contentFiles.css]) expect(existsSync(path.join(out, f)), f).toBe(true);
      }
    }
  });

  it("asks for no host access at install time", () => {
    for (const b of ["firefox", "chrome"]) {
      expect(built[b].manifest.host_permissions, b).toBeUndefined();
      expect(built[b].manifest.content_scripts, b).toBeUndefined();
      expect(built[b].manifest.optional_host_permissions, b).toEqual(["*://*.youtube.com/*", "https://*.twitch.tv/*"]);
    }
  });

  it("does not ship platform.json files", () => {
    expect(existsSync(path.join(built.firefox.out, "platforms/youtube/platform.json"))).toBe(false);
  });
});

describe("platform.json validation", () => {
  const ok = { id: "x", label: "X", matches: ["https://x.test/*"], hostAccess: "optional", contentScript: false, options: [] };
  it("accepts a minimal platform", () => {
    expect(() => validate(ok, "x")).not.toThrow();
  });
  it.each([
    [{ id: "y" }, "folder name"],
    [{ hostAccess: "maybe" }, "hostAccess"],
    [{ options: [{ key: "a", label: "A", default: true }, { key: "a", label: "A", default: true }] }, "duplicate"],
    [{ options: [{ key: "enabled", label: "A", default: true }] }, "reserved"],
    [{ options: [{ key: "a", label: "A", default: "yes" }] }, "boolean"],
    [{ options: [{ key: "a", label: "A", type: "steps", choices: [10, 60], default: [30] }] }, "subset"],
    [{ options: [{ key: "a", label: "A", type: "steps", choices: [10], default: [10], dependsOn: "b" }] }, "depends on"],
    [{ options: [{ key: "a", label: "A", type: "colour", default: 1 }] }, "unknown type"],
  ])("rejects %o", (patch, msg) => {
    expect(() => validate({ ...ok, ...patch }, "x")).toThrow(msg);
  });
});
