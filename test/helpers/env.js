// Test environment: an in-memory WebExtension API and a loader that runs the
// extension's classic scripts in the jsdom global, like the browser does.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPlatforms, generateRegistrySource } from "../../scripts/lib/platforms.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SRC = path.join(ROOT, "src");

function createArea(name, listeners) {
  let data = {};
  const pick = (keys) => {
    if (keys === null || keys === undefined) return structuredClone(data);
    if (typeof keys === "string") keys = [keys];
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
      return out;
    }
    const out = {};
    for (const [k, def] of Object.entries(keys)) out[k] = k in data ? structuredClone(data[k]) : def;
    return out;
  };
  const emit = (changes) => {
    if (!Object.keys(changes).length) return;
    // Browsers deliver storage events asynchronously.
    queueMicrotask(() => listeners.forEach((l) => l(changes, name)));
  };
  return {
    async get(keys) {
      return pick(keys);
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: structuredClone(v) };
        data[k] = structuredClone(v);
      }
      emit(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [keys].flat()) {
        if (k in data) {
          changes[k] = { oldValue: data[k] };
          delete data[k];
        }
      }
      emit(changes);
    },
    async clear() {
      await this.remove(Object.keys(data));
    },
    _dump: () => structuredClone(data),
    _seed: (items) => {
      data = { ...data, ...structuredClone(items) };
    },
  };
}

export function createFakeApi({ granted = [] } = {}) {
  const storageListeners = new Set();
  const grantedOrigins = new Set(granted);
  const event = () => {
    const set = new Set();
    return { addListener: (f) => set.add(f), removeListener: (f) => set.delete(f), _fire: (...a) => set.forEach((f) => f(...a)) };
  };
  const api = {
    runtime: { id: "test-extension", getManifest: () => ({ version: "1.0.0" }), openOptionsPage: async () => {} },
    storage: {
      local: createArea("local", storageListeners),
      sync: createArea("sync", storageListeners),
      onChanged: {
        addListener: (f) => storageListeners.add(f),
        removeListener: (f) => storageListeners.delete(f),
      },
    },
    permissions: {
      contains: async ({ origins }) => origins.every((o) => grantedOrigins.has(o)),
      request: async ({ origins }) => {
        origins.forEach((o) => grantedOrigins.add(o));
        return true;
      },
      onAdded: event(),
      onRemoved: event(),
    },
    tabs: { query: async () => [], create: async () => ({}) },
    commands: { getAll: async () => [{ name: "toggle-addon", shortcut: "Ctrl+Alt+U" }] },
  };
  return api;
}

let registrySource = null;
async function registry() {
  if (!registrySource) registrySource = generateRegistrySource(await discoverPlatforms(SRC));
  return registrySource;
}

/** Evaluates a classic script in the global scope. */
export function runScript(source) {
  (0, eval)(source);
}

export function runFile(relPath) {
  runScript(readFileSync(path.join(SRC, relPath), "utf8"));
}

/**
 * Fresh NoSpoiler namespace with core, registry and the given extra files.
 * Returns { NS, api }.
 */
export async function loadExtension(extraFiles = [], { granted } = {}) {
  delete globalThis.NoSpoiler;
  const api = createFakeApi({ granted });
  globalThis.chrome = api;
  delete globalThis.browser;
  runFile("core/api.js");
  runFile("core/registry.js");
  runScript(await registry());
  runFile("core/storage.js");
  runFile("core/content-core.js");
  runFile("core/player-controls.js");
  for (const f of extraFiles) runFile(f);
  return { NS: globalThis.NoSpoiler, api };
}

export function fixture(name) {
  return readFileSync(path.join(ROOT, "test", "fixtures", name), "utf8");
}

/** Replaces the jsdom document body (and html attributes) with a fixture. */
export function mountFixture(name) {
  const html = document.documentElement;
  for (const a of [...html.attributes]) html.removeAttribute(a.name);
  document.head.innerHTML = "";
  document.body.innerHTML = fixture(name);
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
