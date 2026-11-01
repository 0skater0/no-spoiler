/*
 * Background (Firefox event page, Chrome service worker).
 *
 * - Migrates settings on install and update.
 * - Reflects the master switch in the toolbar icon.
 * - Handles the keyboard shortcut.
 * - Registers content scripts for platforms with optional host access once
 *   the user granted it, and injects into tabs that were open before.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const api = NS.api;

  const ICONS = {
    on: { 16: "/icons/on-16.png", 32: "/icons/on-32.png", 48: "/icons/on-48.png", 128: "/icons/on-128.png" },
    off: { 16: "/icons/off-16.png", 32: "/icons/off-32.png", 48: "/icons/off-48.png", 128: "/icons/off-128.png" },
  };

  const scriptId = (platform) => `ns-${platform.id}`;

  /* ----------------------------- host access --------------------------- */

  async function hasAccess(platform) {
    try {
      return await api.permissions.contains({ origins: platform.matches });
    } catch {
      return false;
    }
  }

  /** Platforms whose host access is missing (required ones only matter for the badge). */
  async function missingRequiredAccess() {
    const missing = [];
    for (const p of NS.platforms) {
      if (p.hostAccess === "required" && !(await hasAccess(p))) missing.push(p);
    }
    return missing;
  }

  /* ------------------------------- icon -------------------------------- */

  async function updateIcon() {
    const state = await NS.readState();
    await api.action.setIcon({ path: state.active ? ICONS.on : ICONS.off });
    await api.action.setTitle({ title: `No Spoilers: ${state.active ? "on" : "off"}` });
    const missing = await missingRequiredAccess();
    await api.action.setBadgeText({ text: missing.length ? "!" : "" });
    if (missing.length) await api.action.setBadgeBackgroundColor({ color: "#d93025" });
  }

  /* --------------------------- content scripts ------------------------- */

  /**
   * Platforms with optional host access have no static content script.
   * Register it while access is granted, unregister it when access is gone.
   */
  async function syncContentScripts() {
    const optional = NS.platforms.filter((p) => p.hostAccess === "optional" && p.contentScript);
    if (!optional.length) return;
    const registered = new Set((await api.scripting.getRegisteredContentScripts()).map((s) => s.id));

    for (const p of optional) {
      const id = scriptId(p);
      const granted = await hasAccess(p);
      if (granted && !registered.has(id)) {
        const script = {
          id,
          matches: p.matches,
          js: p.contentFiles.js,
          css: p.contentFiles.css,
          runAt: "document_start",
        };
        try {
          await api.scripting.registerContentScripts([{ ...script, persistAcrossSessions: true }]);
        } catch {
          // Browsers without persistAcrossSessions: registered again on every startup.
          await api.scripting.registerContentScripts([script]);
        }
      } else if (!granted && registered.has(id)) {
        await api.scripting.unregisterContentScripts({ ids: [id] });
      }
    }
  }

  /**
   * Manifest content scripts are not injected into tabs that were already
   * open (Chrome), and registered ones only apply to new page loads.
   * The content runtime ignores a second injection.
   */
  async function injectIntoOpenTabs(platforms) {
    for (const p of platforms) {
      if (!p.contentScript || !(await hasAccess(p))) continue;
      let tabs = [];
      try {
        tabs = await api.tabs.query({ url: p.matches });
      } catch {
        continue;
      }
      for (const tab of tabs) {
        const target = { tabId: tab.id };
        try {
          await api.scripting.insertCSS({ target, files: p.contentFiles.css });
          await api.scripting.executeScript({ target, files: p.contentFiles.js });
        } catch {
          /* tab not scriptable (discarded, error page): skip */
        }
      }
    }
  }

  /* ------------------------------ lifecycle ---------------------------- */

  async function setup(details) {
    const fromLegacy = details?.reason === "update" && NS.isLegacyVersion(details.previousVersion);
    await NS.runMigration({ fromLegacy });
    await syncContentScripts();
    await updateIcon();
  }

  api.runtime.onInstalled.addListener(async (details) => {
    await setup(details);
    if (details.reason === "install" || details.reason === "update") {
      await injectIntoOpenTabs(NS.platforms);
    }
  });

  api.runtime.onStartup.addListener(() => setup());

  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && NS.KEYS.active in changes) updateIcon();
  });

  api.permissions.onAdded.addListener(async (perms) => {
    await syncContentScripts();
    await updateIcon();
    const origins = perms.origins || [];
    const affected = NS.platforms.filter((p) => p.matches.some((m) => origins.includes(m)));
    await injectIntoOpenTabs(affected);
  });

  api.permissions.onRemoved.addListener(async () => {
    await syncContentScripts();
    await updateIcon();
  });

  api.commands.onCommand.addListener(async (command) => {
    if (command !== "toggle-addon") return;
    const state = await NS.readState();
    await NS.setActive(!state.active);
  });

  // Exposed for debugging from the background console, e.g. to test the
  // migration: NoSpoiler.background.setup({ reason: "update", previousVersion: "0.9.9" })
  NS.background = { setup, syncContentScripts, injectIntoOpenTabs, updateIcon };
})(globalThis);
