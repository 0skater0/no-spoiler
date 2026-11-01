/*
 * Settings UI shared by the popup and the options page.
 * Everything is generated from the platform registry, so a new platform
 * shows up without UI changes. Changes are written to storage immediately;
 * content scripts pick them up through storage.onChanged.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const api = NS.api;
  const ui = (NS.ui = {});

  /** Small DOM builder: h("div", { class: "x", onclick: fn }, child, "text"). */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "checked" || k === "disabled" || k === "open") el[k] = Boolean(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  }
  ui.h = h;

  /** Toggle switch bound to a storage write. `id` keeps focus across re-renders. */
  ui.toggle = function ({ id, label, checked, disabled, onChange, strong }) {
    return h(
      "label",
      { class: `ns-toggle${strong ? " ns-toggle--strong" : ""}${disabled ? " is-disabled" : ""}` },
      h("span", { class: "ns-toggle__label" }, label),
      h("input", {
        type: "checkbox",
        role: "switch",
        "data-focus-id": id,
        checked,
        disabled,
        onchange: (e) => onChange(e.target.checked),
      }),
      h("span", { class: "ns-toggle__track", "aria-hidden": "true" }),
    );
  };

  ui.masterToggle = function (state) {
    return ui.toggle({
      id: "master",
      label: state.active ? "Protection on" : "Protection off",
      checked: state.active,
      strong: true,
      onChange: (v) => NS.setActive(v),
    });
  };

  /** "10 s", "5 min", "1 h" */
  ui.formatSeconds = function (sec) {
    if (sec >= 3600 && sec % 3600 === 0) return `${sec / 3600} h`;
    if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
    return `${sec} s`;
  };

  /**
   * Row of toggle chips for a "steps" option: the user picks which jump sizes
   * appear (each one backwards and forwards).
   */
  ui.stepPicker = function (platform, option, selected, disabled) {
    const id = `${platform.id}.${option.key}`;
    const chips = option.choices.map((sec) => {
      const on = selected.includes(sec);
      return h(
        "button",
        {
          type: "button",
          class: `ns-chip${on ? " is-on" : ""}`,
          "aria-pressed": on ? "true" : "false",
          "data-focus-id": `${id}.${sec}`,
          disabled,
          onclick: () => {
            const next = on ? selected.filter((n) => n !== sec) : [...selected, sec].sort((a, b) => a - b);
            NS.setOption(platform.id, option.key, next);
          },
        },
        ui.formatSeconds(sec),
      );
    });
    return h(
      "div",
      { class: `ns-steps${disabled ? " is-disabled" : ""}`, role: "group", "aria-label": option.label },
      h("span", { class: "ns-steps__label" }, option.label),
      h("div", { class: "ns-steps__chips" }, chips),
    );
  };

  /** "8 of 11 hidden" style summary for collapsed rows. */
  ui.summary = function (platform, state, access) {
    if (!access) return "No access yet";
    const ps = state.platforms[platform.id];
    if (!ps.enabled) return "Off";
    const booleans = platform.options.filter((o) => NS.optionType(o) === "boolean");
    const on = booleans.filter((o) => ps.options[o.key]).length;
    return `${on} of ${booleans.length} on`;
  };

  function groupOptions(platform) {
    const groups = new Map();
    for (const o of platform.options) {
      const g = o.group || "General";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(o);
    }
    return groups;
  }

  function accessNotice(platform) {
    const host = platform.matches.map((m) => m.replace(/^[^:]+:\/\/(\*\.)?/, "").replace(/\/.*$/, "")).join(", ");
    return h(
      "div",
      { class: "ns-access" },
      h("p", {}, `No Spoilers needs access to ${host} to work there.`),
      h(
        "button",
        {
          type: "button",
          class: "ns-button ns-button--primary",
          // permissions.request must run synchronously inside the click handler.
          onclick: () => api.permissions.request({ origins: platform.matches }),
        },
        `Allow access to ${host}`,
      ),
    );
  }

  function optionList(platform, state, disabled) {
    const ps = state.platforms[platform.id];
    const lists = [];
    for (const [group, options] of groupOptions(platform)) {
      lists.push(
        h(
          "fieldset",
          { class: "ns-group" },
          h("legend", {}, group),
          options.map((o) => {
            const off = disabled || (o.dependsOn !== undefined && !ps.options[o.dependsOn]);
            if (NS.optionType(o) === "steps") return ui.stepPicker(platform, o, ps.options[o.key], off);
            return ui.toggle({
              id: `${platform.id}.${o.key}`,
              label: o.label,
              checked: ps.options[o.key],
              disabled: off,
              onChange: (v) => NS.setOption(platform.id, o.key, v),
            });
          }),
        ),
      );
    }
    return lists;
  }

  /**
   * One platform section.
   * @param {object} opts { collapsible, open, showReset }
   */
  ui.platformSection = function (platform, state, access, opts = {}) {
    const ps = state.platforms[platform.id];
    const header = [
      h("span", { class: "ns-platform__name" }, platform.label),
      h("span", { class: "ns-platform__summary" }, ui.summary(platform, state, access)),
    ];
    const body = h(
      "div",
      { class: "ns-platform__body" },
      access
        ? [
            ui.toggle({
              id: `${platform.id}.enabled`,
              label: `Enable on ${platform.label}`,
              checked: ps.enabled,
              strong: true,
              onChange: (v) => NS.setPlatformEnabled(platform.id, v),
            }),
            optionList(platform, state, !ps.enabled),
            opts.showReset
              ? h(
                  "button",
                  { type: "button", class: "ns-button", onclick: () => NS.resetPlatform(platform.id) },
                  "Reset to defaults",
                )
              : null,
          ]
        : accessNotice(platform),
    );

    const cls = `ns-platform${state.active ? "" : " is-inactive"}`;
    if (opts.collapsible) {
      return h(
        "details",
        { class: cls, "data-platform": platform.id, open: opts.open },
        h("summary", { class: "ns-platform__header" }, header),
        body,
      );
    }
    return h(
      "section",
      { class: cls, "data-platform": platform.id },
      h("h2", { class: "ns-platform__header" }, header),
      body,
    );
  };

  /** Loads state and access for all platforms. */
  ui.load = async function () {
    const state = await NS.readState();
    const access = {};
    for (const p of NS.platforms) {
      try {
        access[p.id] = await api.permissions.contains({ origins: p.matches });
      } catch {
        access[p.id] = false;
      }
    }
    return { state, access };
  };

  /**
   * Re-renders on every settings or permission change. Keeps focus and the
   * open/closed state of collapsible sections.
   */
  ui.mount = function (container, render) {
    async function refresh() {
      const data = await ui.load();
      const focusId = document.activeElement?.getAttribute?.("data-focus-id");
      const openIds = new Set(
        [...container.querySelectorAll("details[open]")].map((d) => d.getAttribute("data-platform")),
      );
      const firstRender = !container.hasChildNodes();
      container.replaceChildren(...[render(data, { openIds, firstRender })].flat());
      if (focusId) container.querySelector(`[data-focus-id="${CSS.escape(focusId)}"]`)?.focus();
    }
    api.storage.onChanged.addListener((changes, area) => {
      if (NS.isSettingsChange(changes, area)) refresh();
    });
    api.permissions.onAdded?.addListener(refresh);
    api.permissions.onRemoved?.addListener(refresh);
    return refresh();
  };
})(globalThis);
