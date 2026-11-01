/*
 * Toolbar popup. The view depends on the active tab:
 * - on a supported site: that platform's settings at the top, the other
 *   platforms collapsed below;
 * - anywhere else: an overview with one collapsible row per platform.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const api = NS.api;
  const { ui } = NS;

  /** Which platform the popup should focus on, or null for the overview. */
  NS.popupView = function (url) {
    const platform = NS.platformForUrl(url);
    return platform ? { kind: "platform", platform } : { kind: "overview", platform: null };
  };

  async function activeTabUrl() {
    try {
      const [tab] = await api.tabs.query({ active: true, currentWindow: true });
      return tab?.url || "";
    } catch {
      return "";
    }
  }

  function render(view) {
    return ({ state, access }, { openIds }) => {
      document.getElementById("master").replaceChildren(ui.masterToggle(state));
      const sections = [];
      if (view.kind === "platform") {
        const p = view.platform;
        sections.push(ui.platformSection(p, state, access[p.id], { collapsible: false }));
        const others = NS.platforms.filter((o) => o.id !== p.id);
        if (others.length) sections.push(ui.h("h2", { class: "ns-subheading" }, "Other sites"));
        for (const o of others) {
          sections.push(ui.platformSection(o, state, access[o.id], { collapsible: true, open: openIds.has(o.id) }));
        }
      } else {
        for (const p of NS.platforms) {
          sections.push(ui.platformSection(p, state, access[p.id], { collapsible: true, open: openIds.has(p.id) }));
        }
      }
      return sections;
    };
  }

  async function showShortcut() {
    try {
      const cmd = (await api.commands.getAll()).find((c) => c.name === "toggle-addon");
      if (cmd?.shortcut) document.getElementById("shortcut").textContent = `Toggle: ${cmd.shortcut}`;
    } catch {
      /* commands API unavailable (e.g. Firefox for Android) */
    }
  }

  async function main() {
    document.getElementById("open-options").addEventListener("click", () => {
      api.runtime.openOptionsPage();
      window.close();
    });
    const view = NS.popupView(await activeTabUrl());
    await ui.mount(document.getElementById("content"), render(view));
    showShortcut();
  }

  if (typeof document !== "undefined" && document.getElementById("content")) main();
})(globalThis);
