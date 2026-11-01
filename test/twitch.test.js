import { beforeEach, describe, expect, it } from "vitest";
import { fixture, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS;
beforeEach(async () => {
  ({ NS } = await loadExtension(["platforms/twitch/content.js"]));
});

const JS_ONLY = ["hideTooltips", "skipButtons", "overlayControls"];

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

  it("hides what each option promises on the home page (live markup)", () => {
    checkFixture(NS, "twitch", "twitch-home.html", { url: "https://www.twitch.tv/" });
  });

  it("hides what each option promises on a live channel", () => {
    checkFixture(NS, "twitch", "twitch-live.html", { url: "https://www.twitch.tv/somechannel" });
  });

  it("keeps the chat replay rule and the live chat rule apart", () => {
    const hidden = render(NS, "twitch", "twitch-live.html", ["hideLiveChat"], { url: "https://www.twitch.tv/videos/1" });
    expect(hidden(document.querySelector(".chat-shell"))).toBe(false);
  });

  it("covers every CSS option with a fixture expectation", () => {
    const covered = coveredOptions(["twitch-vod.html", "twitch-directory.html", "twitch-home.html", "twitch-live.html"].map(fixture));
    const keys = NS.getPlatform("twitch").options.map((o) => o.key).filter((k) => !JS_ONLY.includes(k));
    for (const k of keys) expect(covered.has(k), k).toBe(true);
  });

  it("hides card stats until they are checked (fail closed)", () => {
    const hidden = render(NS, "twitch", "twitch-directory.html", ["hideCardDurations"], { runJs: false });
    for (const el of document.querySelectorAll("[data-expect-keep]")) expect(hidden(el)).toBe(true);
  });

  it("tells sidebar sections apart without their localised labels", () => {
    const hidden = render(NS, "twitch", "twitch-home.html", ["hideSidebarRecommended", "hideSidebarCategories"], { url: "https://www.twitch.tv/" });
    const sections = [...document.querySelectorAll(".side-nav-section")].map(hidden);
    expect(sections).toEqual([false, true, true]);
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

  it("hides seek bar progress and knob but keeps the bar clickable", () => {
    const hidden = render(NS, "twitch", "twitch-vod.html", ["hideSeekbarProgress"], { url: "https://www.twitch.tv/videos/1" });
    expect(hidden(document.querySelector('[data-a-target="player-seekbar"]'))).toBe(false);
    expect(hidden(document.querySelector(".seekbar-bar"))).toBe(false);
    expect(hidden(document.querySelector(".seekbar-thumb"))).toBe(true);
  });

  it("removes duration marks when switched off", () => {
    mountFixture("twitch-directory.html");
    NS.hooks.twitch.update(ctx());
    expect(document.querySelector("[data-ns-duration]")).not.toBeNull();
    NS.hooks.twitch.update(ctx({ active: false }));
    expect(document.querySelector("[data-ns-duration], [data-ns-keep]")).toBeNull();
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

describe("Twitch seek controls", () => {
  it("adds skip bar and overlay on video pages only, once", () => {
    mountFixture("twitch-vod.html");
    const c = ctx({ url: "https://www.twitch.tv/videos/1" }, { skipButtons: true, overlayControls: true });
    NS.hooks.twitch.update(c);
    NS.hooks.twitch.update({ ...c, reason: "mutation" });
    expect(document.querySelectorAll('[data-ns-player="skip-bar"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-ns-player="overlay"]')).toHaveLength(1);
    // inserted after the play button's wrapper, inside the left controls
    const bar = document.querySelector('[data-ns-player="skip-bar"]');
    expect(bar.previousElementSibling.classList.contains("play-wrapper")).toBe(true);
    expect(bar.parentElement.classList.contains("player-controls__left-control-group")).toBe(true);

    NS.hooks.twitch.update({ ...c, reason: "navigate", url: "https://www.twitch.tv/somechannel" });
    expect(document.querySelector("[data-ns-player]")).toBeNull();
  });

  it("does not touch the home page carousel player", () => {
    mountFixture("twitch-home.html");
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1" }, { skipButtons: true, overlayControls: true }));
    expect(document.querySelector("[data-ns-player]")).toBeNull();
  });

  it("the overlay seeks and toggles play", () => {
    mountFixture("twitch-vod.html");
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1" }, { overlayControls: true }));
    const video = document.querySelector("video");
    video.currentTime = 100;
    const buttons = [...document.querySelectorAll('[data-ns-player="overlay"] button')];
    buttons.find((b) => b.textContent === "+1m").click();
    expect(video.currentTime).toBe(160);
    buttons.find((b) => b.textContent === "\u221210m").click();
    expect(video.currentTime).toBe(0);
  });
});
