/*
 * Content script runtime shared by all platforms.
 *
 * - Sets html classes from the settings (CSS rules of the platform hang on them).
 * - Starts fail-closed with the defaults until storage has answered.
 * - Follows storage changes, so toggles apply without reload.
 * - Runs one throttled MutationObserver per page and calls the platform's
 *   `update(ctx)` hook on state changes, DOM changes and SPA navigation.
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});

  /* ------------------------------------------------------------------ */
  /* DOM helpers for platform modules                                    */
  /* ------------------------------------------------------------------ */

  const DURATION_RE = /^\d{1,2}:\d{2}(?::\d{2})?$/;

  const dom = (NS.dom = {});

  /** True for "4:05", "12:34", "1:02:03". Rejects "12:34 PM", "LIVE", "1.2K views". */
  dom.isDuration = function (text) {
    return typeof text === "string" && DURATION_RE.test(text.trim());
  };

  /**
   * querySelectorAll over a list of alternative selectors. Invalid selectors
   * are skipped, so one outdated selector cannot break the others.
   */
  dom.queryAll = function (scope, selectors) {
    const found = new Set();
    for (const sel of selectors) {
      let list;
      try {
        list = scope.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const el of list) found.add(el);
    }
    return [...found];
  };

  dom.queryFirst = function (scope, selectors) {
    for (const sel of selectors) {
      try {
        const el = scope.querySelector(sel);
        if (el) return el;
      } catch {
        /* invalid selector, try the next one */
      }
    }
    return null;
  };

  /** Removes a data attribute from every element that carries it. */
  dom.clearAttr = function (scope, attr) {
    for (const el of scope.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr);
  };

  /**
   * Native tooltips cannot be hidden with CSS. Moves `title` into
   * `data-ns-title` so the tooltip disappears; `restoreTitles` reverses it.
   */
  dom.stashTitles = function (scope, selectors) {
    for (const el of dom.queryAll(scope, selectors)) {
      if (el.hasAttribute("title")) {
        el.setAttribute("data-ns-title", el.getAttribute("title"));
        el.removeAttribute("title");
      }
    }
  };

  dom.restoreTitles = function (scope) {
    for (const el of scope.querySelectorAll("[data-ns-title]")) {
      if (!el.hasAttribute("title")) el.setAttribute("title", el.getAttribute("data-ns-title"));
      el.removeAttribute("data-ns-title");
    }
  };

  /**
   * Marks the badge that shows a duration. Starts at `el` and walks up while
   * the parent shows the same text, so the whole badge (including its
   * background) is marked, but never beyond `stop`.
   */
  dom.badgeFor = function (el, stop) {
    const text = el.textContent.trim();
    let node = el;
    while (node.parentElement && node.parentElement !== stop && node.parentElement.textContent.trim() === text) {
      node = node.parentElement;
    }
    return node;
  };

  /* ------------------------------------------------------------------ */
  /* Runtime                                                             */
  /* ------------------------------------------------------------------ */

  const MIN_TICK_INTERVAL_MS = 150;

  /**
   * Creates the content runtime for one platform. Exposed for tests;
   * `NS.startContent()` is the entry point in the browser.
   */
  NS.createContentRuntime = function (platform, hooks = {}, env = {}) {
    const doc = env.document || root.document;
    const rootEl = doc.documentElement;
    const getUrl = env.getUrl || (() => root.location.href);

    let state = NS.defaultState();
    let lastUrl = getUrl();
    let appliedClasses = [];
    let tickTimer = null;
    let lastTick = 0;
    let observer = null;
    let stopped = false;

    function ctx(reason) {
      const ps = state.platforms[platform.id];
      return {
        reason, // "state" | "mutation" | "navigate"
        active: NS.isPlatformActive(state, platform.id),
        options: ps.options,
        document: doc,
        url: lastUrl,
        state,
      };
    }

    function applyClasses() {
      const wanted = NS.classesFor(platform, state);
      for (const c of appliedClasses) {
        if (!wanted.includes(c)) rootEl.classList.remove(c);
      }
      for (const c of wanted) rootEl.classList.add(c);
      appliedClasses = wanted;
    }

    /** Re-adds classes if the page replaced the class attribute of <html>. */
    function classesIntact() {
      return appliedClasses.every((c) => rootEl.classList.contains(c));
    }

    function runHook(reason) {
      if (typeof hooks.update !== "function") return;
      try {
        hooks.update(ctx(reason));
      } catch (err) {
        if (NS.debug) console.warn("[No Spoilers]", err);
      }
    }

    function tick() {
      tickTimer = null;
      lastTick = Date.now();
      if (stopped) return;
      if (env.isContextInvalid ? env.isContextInvalid() : NS.isContextInvalid()) {
        // Extension was updated or removed; this copy of the script is orphaned.
        stop();
        return;
      }
      if (!classesIntact()) applyClasses();
      const url = getUrl();
      if (url !== lastUrl) {
        lastUrl = url;
        runHook("navigate");
      }
      runHook("mutation");
    }

    function scheduleTick() {
      if (tickTimer !== null || stopped) return;
      const wait = Math.max(0, lastTick + MIN_TICK_INTERVAL_MS - Date.now());
      tickTimer = setTimeout(tick, wait);
    }

    function setState(next) {
      state = next;
      applyClasses();
      runHook("state");
    }

    function onNavigateEvent() {
      scheduleTick();
    }

    function start() {
      // Fail closed: hide with the defaults until storage answered.
      applyClasses();

      const MO = env.MutationObserver || root.MutationObserver;
      observer = new MO(scheduleTick);
      observer.observe(rootEl, { childList: true, subtree: true, characterData: true });

      root.addEventListener?.("popstate", onNavigateEvent);
      for (const evt of hooks.navigationEvents || []) doc.addEventListener(evt, onNavigateEvent);
    }

    function stop() {
      stopped = true;
      observer?.disconnect();
      if (tickTimer !== null) clearTimeout(tickTimer);
      root.removeEventListener?.("popstate", onNavigateEvent);
      for (const evt of hooks.navigationEvents || []) doc.removeEventListener(evt, onNavigateEvent);
    }

    return { start, stop, setState, tick, scheduleTick, getState: () => state };
  };

  /** Entry point used by core/content-start.js. */
  NS.startContent = function () {
    if (NS.contentRuntime) return; // already running (re-injection after install/update)
    const platform = NS.platformForUrl(root.location.href);
    if (!platform) return;

    const runtime = NS.createContentRuntime(platform, NS.hooks[platform.id]);
    NS.contentRuntime = runtime;
    runtime.start();

    const api = NS.api;
    const reload = () =>
      NS.readState().then(
        (s) => runtime.setState(s),
        () => {
          /* storage unavailable (context invalidated): keep current state */
        },
      );

    api.storage.onChanged.addListener((changes, areaName) => {
      if (NS.isSettingsChange(changes, areaName)) reload();
    });
    reload();
  };
})(globalThis);
