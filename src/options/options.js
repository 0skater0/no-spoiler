/* Options page ("All settings"): every platform, keyboard shortcut. */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const api = NS.api;
  const { ui } = NS;
  const { h } = ui;

  const COMMAND = "toggle-addon";
  const isMac = /Mac/i.test(navigator.platform || navigator.userAgent);

  /**
   * Turns a keydown event into a WebExtension shortcut string, or null if the
   * combination is not allowed (at least one modifier plus one key).
   */
  NS.shortcutFromEvent = function (e, mac = isMac) {
    const mods = [];
    if (mac) {
      if (e.metaKey) mods.push("Command");
      if (e.ctrlKey) mods.push("MacCtrl");
    } else if (e.ctrlKey) {
      mods.push("Ctrl");
    }
    if (e.altKey) mods.push("Alt");
    if (e.shiftKey) mods.push("Shift");

    let key = null;
    if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
    else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
    else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
    else {
      const named = {
        Comma: "Comma", Period: "Period", Space: "Space", Home: "Home", End: "End",
        PageUp: "PageUp", PageDown: "PageDown", Insert: "Insert", Delete: "Delete",
        ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      };
      key = named[e.code] || null;
    }
    const hasPrimary = mods.some((m) => m !== "Shift");
    if (!key || !hasPrimary) return null;
    return [...mods, key].join("+");
  };

  async function currentShortcut() {
    try {
      const cmd = (await api.commands.getAll()).find((c) => c.name === COMMAND);
      return cmd?.shortcut || "";
    } catch {
      return "";
    }
  }

  async function renderShortcut() {
    const box = document.getElementById("shortcut");
    const shortcut = await currentShortcut();

    if (typeof api.commands?.update !== "function") {
      // Chrome: shortcuts can only be changed on chrome://extensions/shortcuts.
      box.replaceChildren(
        h("p", {}, "Current: ", h("kbd", {}, shortcut || "not set")),
        h(
          "button",
          { type: "button", class: "ns-button", onclick: () => api.tabs.create({ url: "chrome://extensions/shortcuts" }) },
          "Change shortcut",
        ),
      );
      return;
    }

    const status = h("span", { class: "ns-muted", role: "status" });
    const input = h("input", {
      type: "text",
      class: "ns-input",
      value: shortcut,
      readonly: true,
      "aria-label": "Shortcut. Focus the field and press the new key combination.",
      onkeydown: async (e) => {
        if (e.key === "Tab") return;
        e.preventDefault();
        const value = NS.shortcutFromEvent(e);
        if (!value) {
          status.textContent = "Use Ctrl or Alt plus a letter, digit or F-key.";
          return;
        }
        try {
          await api.commands.update({ name: COMMAND, shortcut: value });
          input.value = value;
          status.textContent = "Saved.";
        } catch (err) {
          status.textContent = `Not possible: ${err.message}`;
        }
      },
    });
    const reset = h(
      "button",
      {
        type: "button",
        class: "ns-button",
        onclick: async () => {
          await api.commands.reset(COMMAND);
          input.value = await currentShortcut();
          status.textContent = "Reset to default.";
        },
      },
      "Reset",
    );
    box.replaceChildren(h("div", { class: "ns-row" }, input, reset), status);
  }

  function render({ state, access }) {
    document.getElementById("master").replaceChildren(ui.masterToggle(state));
    return NS.platforms.map((p) => ui.platformSection(p, state, access[p.id], { collapsible: false, showReset: true }));
  }

  async function main() {
    if (location.hash === "#welcome") document.getElementById("welcome").hidden = false;
    document.getElementById("version").textContent = `Version ${api.runtime.getManifest().version}`;
    renderShortcut();
    await ui.mount(document.getElementById("content"), render);
  }

  if (typeof document !== "undefined" && document.getElementById("content")) main();
})(globalThis);
