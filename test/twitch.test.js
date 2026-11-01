import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS;
beforeEach(async () => {
  ({ NS } = await loadExtension(["platforms/twitch/content.js"]));
});

const JS_ONLY = ["hideTooltips"];

function ctx(overrides = {}, optionOverrides = {}) {
  const state = NS.defaultState();
  Object.assign(state.platforms.twitch.options, optionOverrides);
  return { reason: "state", active: true, options: state.platforms.twitch.options, document, url: "https://www.twitch.tv/directory", state, ...overrides };
}

describe("Twitch stylesheet", () => {
  it("hides what each option promises on a video page", () => {
    checkFixture(NS, "twitch", "twitch-vod.html", { url: "https://www.twitch.tv/videos/123456" });
  });

  it("hides what each option promises on card lists", () => {
    checkFixture(NS, "twitch", "twitch-directory.html", { url: "https://www.twitch.tv/directory/category/x/videos" });
  });

  it("covers every CSS option with a fixture expectation", () => {
    const covered = coveredOptions(["twitch-vod.html", "twitch-directory.html"].map(fixture));
    const keys = NS.getPlatform("twitch").options.map((o) => o.key).filter((k) => !JS_ONLY.includes(k));
    for (const k of keys) expect(covered.has(k), k).toBe(true);
  });

  it("hides card stats until they are checked (fail closed)", () => {
    const hidden = render(NS, "twitch", "twitch-directory.html", ["hideCardDurations"], { runJs: false });
    for (const el of document.querySelectorAll("[data-expect-keep]")) expect(hidden(el)).toBe(true);
  });

  it("masks titles only on video and clip pages", () => {
    const hidden = render(NS, "twitch", "twitch-vod.html", ["maskTitles"], { url: "https://www.twitch.tv/somechannel" });
    expect(hidden(document.querySelector('[data-a-target="stream-title"]'))).toBe(false);
  });
});

describe("Twitch page type", () => {
  it("detects videos, clips and other pages", () => {
    const { pageType } = NS.twitch;
    expect(pageType("https://www.twitch.tv/videos/123")).toBe("vod");
    expect(pageType("https://www.twitch.tv/chan/clip/Slug-1")).toBe("clip");
    expect(pageType("https://clips.twitch.tv/Slug")).toBe("clip");
    expect(pageType("https://www.twitch.tv/chan")).toBe("other");
    expect(pageType("https://www.twitch.tv/chan/videos")).toBe("other");
    expect(pageType("not a url")).toBe("other");
  });

  it("updates the page attribute on navigation", () => {
    mountFixture("twitch-vod.html");
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1" }));
    expect(document.documentElement.getAttribute("data-ns-page")).toBe("vod");
    NS.hooks.twitch.update(ctx({ reason: "navigate", url: "https://www.twitch.tv/chan" }));
    expect(document.documentElement.getAttribute("data-ns-page")).toBe("other");
  });
});

describe("Twitch durations and seek bar", () => {
  it("marks durations by text, not other stats", () => {
    mountFixture("twitch-directory.html");
    NS.twitch.markDurations(document);
    const marked = [...document.querySelectorAll("[data-ns-duration]")].map((e) => e.textContent.trim());
    expect(marked.sort()).toEqual(["0:30", "3:12:45"]);
    expect(document.querySelector(".live-time [data-ns-duration]")).toBeNull();
  });

  it("marks the seek bar container, never an input", () => {
    document.body.innerHTML = '<div id="wrap"><input type="range" data-a-target="player-seekbar" /></div>';
    NS.twitch.markSeekbars(document, window);
    expect(document.getElementById("wrap").hasAttribute("data-ns-seekbar")).toBe(true);
    expect(document.querySelector("input").hasAttribute("data-ns-seekbar")).toBe(false);
  });

  it("removes marks when switched off", () => {
    mountFixture("twitch-vod.html");
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1" }));
    expect(document.querySelector("[data-ns-seekbar]")).not.toBeNull();
    NS.hooks.twitch.update(ctx({ active: false }));
    expect(document.querySelector("[data-ns-seekbar], [data-ns-duration]")).toBeNull();
  });
});

describe("Twitch tooltips", () => {
  it("removes title tooltips and restores them", () => {
    mountFixture("twitch-directory.html");
    const before = [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"));
    NS.hooks.twitch.update(ctx({}, { hideTooltips: true }));
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
    NS.hooks.twitch.update(ctx({}, { hideTooltips: false }));
    expect([...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"))).toEqual(before);
  });
});
