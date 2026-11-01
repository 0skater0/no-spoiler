/*
 * Platform registry and settings model.
 *
 * Platform metadata (id, label, match patterns, options) comes from
 * `src/platforms/<id>/platform.json`. The build turns those files into
 * `core/platforms.generated.js`, which calls `NoSpoiler.registerPlatforms()`.
 * Platform runtime code (content.js) registers its hooks with
 * `NoSpoiler.definePlatform()`.
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});

  /** Storage keys that are not tied to a platform. */
  NS.KEYS = Object.freeze({
    active: "ns.active", // storage.local, master switch (per device)
    schema: "ns.schema", // storage.sync, settings schema version
  });

  NS.SCHEMA_VERSION = 2;
  NS.CLASS_PREFIX = "ns-";
  NS.ACTIVE_CLASS = "ns-on";

  NS.platforms = NS.platforms || [];
  NS.hooks = NS.hooks || {};

  NS.registerPlatforms = function (list) {
    for (const meta of list) {
      if (!NS.platforms.some((p) => p.id === meta.id)) {
        NS.platforms.push(Object.freeze(meta));
      }
    }
  };

  NS.getPlatform = function (id) {
    return NS.platforms.find((p) => p.id === id) || null;
  };

  /** Registers the runtime hooks of a platform. Called by platforms/<id>/content.js. */
  NS.definePlatform = function (id, hooks) {
    NS.hooks[id] = hooks;
  };

  NS.enabledKey = (platformId) => `${platformId}.enabled`;
  NS.optionKey = (platformId, optionKey) => `${platformId}.${optionKey}`;
  NS.optionClass = (platformId, optionKey) => `${NS.CLASS_PREFIX}${platformId}-${optionKey}`;

  /**
   * Converts a WebExtension match pattern into a RegExp.
   * Supports the subset used by this extension: <scheme>://<host>/<path>.
   */
  NS.matchPatternToRegExp = function (pattern) {
    const m = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(pattern);
    if (!m) throw new Error(`Unsupported match pattern: ${pattern}`);
    const [, scheme, host, path] = m;
    const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const schemeRe = scheme === "*" ? "https?" : scheme;
    let hostRe;
    if (host === "*") hostRe = "[^/]+";
    else if (host.startsWith("*.")) hostRe = `(?:[^/]+\\.)?${esc(host.slice(2))}`;
    else hostRe = esc(host);
    const pathRe = path.split("*").map(esc).join(".*");
    return new RegExp(`^${schemeRe}://${hostRe}(?::\\d+)?${pathRe}$`);
  };

  NS.urlMatches = function (url, patterns) {
    if (typeof url !== "string") return false;
    return patterns.some((p) => NS.matchPatternToRegExp(p).test(url));
  };

  NS.platformForUrl = function (url) {
    return NS.platforms.find((p) => NS.urlMatches(url, p.matches)) || null;
  };

  /** Settings with every default applied. */
  NS.defaultState = function () {
    const state = { active: true, platforms: {} };
    for (const p of NS.platforms) {
      const options = {};
      for (const o of p.options) options[o.key] = o.default;
      state.platforms[p.id] = { enabled: true, options };
    }
    return state;
  };

  /**
   * Builds the settings state from raw storage contents.
   * Missing keys fall back to defaults, unknown keys are ignored.
   */
  NS.stateFromStorage = function (syncData = {}, localData = {}) {
    const state = NS.defaultState();
    if (typeof localData[NS.KEYS.active] === "boolean") {
      state.active = localData[NS.KEYS.active];
    }
    for (const p of NS.platforms) {
      const ps = state.platforms[p.id];
      const enabled = syncData[NS.enabledKey(p.id)];
      if (typeof enabled === "boolean") ps.enabled = enabled;
      for (const o of p.options) {
        const v = syncData[NS.optionKey(p.id, o.key)];
        if (typeof v === "boolean") ps.options[o.key] = v;
      }
    }
    return state;
  };

  /** True when the platform's rules should apply. */
  NS.isPlatformActive = function (state, platformId) {
    return Boolean(state.active && state.platforms[platformId]?.enabled);
  };

  /** The html classes a page of this platform should carry for the given state. */
  NS.classesFor = function (platform, state) {
    if (!NS.isPlatformActive(state, platform.id)) return [];
    const classes = [NS.ACTIVE_CLASS];
    const opts = state.platforms[platform.id].options;
    for (const o of platform.options) {
      if (opts[o.key]) classes.push(NS.optionClass(platform.id, o.key));
    }
    return classes;
  };
})(globalThis);
