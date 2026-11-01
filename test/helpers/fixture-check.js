// Generic check of a platform stylesheet (plus its JS marking) against a fixture.
import { expect } from "vitest";
import { hidingSelectors, isHidden, setHtmlClasses } from "./css.js";
import { mountFixture } from "./env.js";

function ctxFor(NS, platform, enabledKeys, url) {
  const state = NS.defaultState();
  for (const o of platform.options) state.platforms[platform.id].options[o.key] = enabledKeys.includes(o.key);
  return {
    reason: "state",
    active: true,
    options: state.platforms[platform.id].options,
    document,
    url,
    state,
  };
}

/**
 * Mounts the fixture with the given options switched on, runs the platform's
 * JS hook (unless runJs is false) and returns a predicate el -> hidden.
 */
export function render(NS, platformId, fixtureName, enabledKeys, { url = "https://example.test/", runJs = true, active = true } = {}) {
  const platform = NS.getPlatform(platformId);
  mountFixture(fixtureName);
  const ctx = ctxFor(NS, platform, enabledKeys, url);
  ctx.active = active;
  setHtmlClasses(active ? NS.classesFor(platform, ctx.state) : []);
  if (runJs) NS.hooks[platformId]?.update(ctx);
  const selectors = hidingSelectors(platformId);
  return (el) => isHidden(el, selectors);
}

const all = (sel) => [...document.querySelectorAll(sel)];
const describeEl = (el) => el.outerHTML.slice(0, 120);

/** Runs every expectation of a fixture for every option of the platform. */
export function checkFixture(NS, platformId, fixtureName, opts = {}) {
  const platform = NS.getPlatform(platformId);
  const keys = platform.options.map((o) => o.key);

  for (const key of keys) {
    const hidden = render(NS, platformId, fixtureName, [key], opts);
    for (const el of all(`[data-expect-hidden~="${key}"]`)) {
      expect(hidden(el), `${key} should hide ${describeEl(el)}`).toBe(true);
    }
    for (const el of all("[data-expect-visible], [data-expect-keep]")) {
      expect(hidden(el), `${key} must not hide ${describeEl(el)}`).toBe(false);
    }
  }

  // Everything on at once: neighbours stay visible.
  const hiddenAll = render(NS, platformId, fixtureName, keys, opts);
  for (const el of all("[data-expect-visible], [data-expect-keep]")) {
    expect(hiddenAll(el), `all options must not hide ${describeEl(el)}`).toBe(false);
  }

  // Protection off: nothing is hidden.
  const hiddenOff = render(NS, platformId, fixtureName, keys, { ...opts, active: false });
  for (const el of all("[data-expect-hidden]")) {
    expect(hiddenOff(el), `inactive must not hide ${describeEl(el)}`).toBe(false);
  }
}

/** Every option must be covered by at least one fixture expectation. */
export function coveredOptions(fixtures) {
  const covered = new Set();
  for (const html of fixtures) {
    for (const m of html.matchAll(/data-expect-hidden="([^"]+)"/g)) m[1].split(/\s+/).forEach((k) => covered.add(k));
  }
  return covered;
}
