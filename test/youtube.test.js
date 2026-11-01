import { beforeEach, describe, expect, it } from "vitest";
import { fixture, flush, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS, api;
beforeEach(async () => {
  ({ NS, api } = await loadExtension(["platforms/youtube/content.js"]));
});

const FIXTURES = ["youtube-watch.html", "youtube-home.html"];
const JS_ONLY = ["disableAutoplay", "skipButtons", "overlayControls", "hideTooltips", "skipButtonSteps", "overlaySteps"];

function ctx(overrides = {}, optionOverrides = {}) {
  const state = NS.defaultState();
  Object.assign(state.platforms.youtube.options, optionOverrides);
  return { reason: "state", active: true, options: state.platforms.youtube.options, document, url: "https://www.youtube.com/watch?v=x", state, ...overrides };
}

describe("YouTube stylesheet", () => {
  for (const name of FIXTURES) {
    it(`hides what each option promises in ${name}`, () => {
      checkFixture(NS, "youtube", name);
    });
  }

  it("covers every CSS option with a fixture expectation", () => {
    const covered = coveredOptions(FIXTURES.map(fixture));
    const keys = NS.getPlatform("youtube").options.map((o) => o.key).filter((k) => !JS_ONLY.includes(k));
    for (const k of keys) expect(covered.has(k), k).toBe(true);
  });

  it("hides unknown thumbnail badges until they are checked (fail closed)", () => {
    const hidden = render(NS, "youtube", "youtube-home.html", ["hideThumbnailDurations"], { runJs: false });
    for (const el of document.querySelectorAll("[data-expect-keep]")) expect(hidden(el)).toBe(true);
  });
});

describe("YouTube thumbnail badges", () => {
  it("keeps non-duration badges and re-evaluates recycled elements", () => {
    mountFixture("youtube-home.html");
    NS.youtube.markBadges(document);
    const live = document.querySelector("[data-expect-keep]");
    expect(live.hasAttribute("data-ns-keep")).toBe(true);
    // YouTube reuses the element for another video
    live.querySelector(".yt-badge-shape__text").textContent = "8:15";
    NS.youtube.markBadges(document);
    expect(live.hasAttribute("data-ns-keep")).toBe(false);
  });

  it("removes its marks when switched off", () => {
    mountFixture("youtube-home.html");
    NS.hooks.youtube.update(ctx());
    expect(document.querySelector("[data-ns-keep]")).not.toBeNull();
    NS.hooks.youtube.update(ctx({ active: false }));
    expect(document.querySelector("[data-ns-keep]")).toBeNull();
  });
});

describe("YouTube seek controls", () => {
  it("inserts exactly one skip bar, also after repeated updates and navigation", () => {
    mountFixture("youtube-watch.html");
    const c = ctx({}, { skipButtons: true });
    NS.hooks.youtube.update(c);
    NS.hooks.youtube.update({ ...c, reason: "mutation" });
    NS.hooks.youtube.update({ ...c, reason: "navigate" });
    NS.hooks.youtube.update({ ...c, reason: "state" });
    const sets = document.querySelectorAll(".ns-skip-controls");
    expect(sets).toHaveLength(1);
    expect(sets[0].previousElementSibling.classList.contains("ytp-play-button")).toBe(true);
    expect([...sets[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual(["\u221210m", "\u22125m", "+5m", "+10m"]);
  });

  it("re-inserts after the player was rebuilt and removes on disable", () => {
    mountFixture("youtube-watch.html");
    const c = ctx({}, { skipButtons: true });
    NS.hooks.youtube.update(c);
    document.querySelector(".ns-skip-controls").remove();
    NS.hooks.youtube.update({ ...c, reason: "mutation" });
    expect(document.querySelectorAll(".ns-skip-controls")).toHaveLength(1);
    NS.hooks.youtube.update(ctx({}, { skipButtons: false }));
    expect(document.querySelectorAll(".ns-skip-controls")).toHaveLength(0);
  });

  it("clicking a skip button seeks the player's video", () => {
    mountFixture("youtube-watch.html");
    NS.hooks.youtube.update(ctx({}, { skipButtons: true }));
    const video = document.querySelector("video");
    video.currentTime = 100;
    document.querySelectorAll(".ns-skip-controls button")[2].click();
    expect(video.currentTime).toBe(400);
  });

  it("rebuilds the skip bar when the jump sizes change", () => {
    mountFixture("youtube-watch.html");
    NS.hooks.youtube.update(ctx({}, { skipButtons: true }));
    NS.hooks.youtube.update(ctx({}, { skipButtons: true, skipButtonSteps: [30, 3600] }));
    const bars = document.querySelectorAll(".ns-skip-controls");
    expect(bars).toHaveLength(1);
    expect([...bars[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual(["\u22121h", "\u221230s", "+30s", "+1h"]);
  });

  it("adds one centre overlay to the main player and removes it", () => {
    mountFixture("youtube-watch.html");
    const c = ctx({}, { overlayControls: true });
    NS.hooks.youtube.update(c);
    NS.hooks.youtube.update({ ...c, reason: "mutation" });
    const overlays = document.querySelectorAll('#movie_player > [data-ns-player="overlay"]');
    expect(overlays).toHaveLength(1);
    expect([...overlays[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "\u221210m", "\u22125m", "\u22121m", "\u23EF", "+1m", "+5m", "+10m",
    ]);
    NS.hooks.youtube.update(ctx({}, { overlayControls: false }));
    expect(document.querySelector('[data-ns-player="overlay"]')).toBeNull();
  });
});

describe("YouTube autoplay", () => {
  function toggle() {
    return document.querySelector(".ytp-autonav-toggle-button");
  }
  function wireToggle() {
    // Simulate YouTube: clicking the button flips aria-checked.
    toggle().closest("button").addEventListener("click", () => {
      const t = toggle();
      t.setAttribute("aria-checked", t.getAttribute("aria-checked") === "true" ? "false" : "true");
    });
  }

  it("switches autoplay off and back on only if it switched it", async () => {
    mountFixture("youtube-watch.html");
    wireToggle();
    NS.hooks.youtube.update(ctx());
    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect((await api.storage.local.get("youtube.autoplayRestore"))["youtube.autoplayRestore"]).toBe(true);

    NS.hooks.youtube.update(ctx({ active: false }));
    await flush();
    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(await api.storage.local.get("youtube.autoplayRestore")).toEqual({});
  });

  it("leaves autoplay alone if the user had it off", async () => {
    mountFixture("youtube-watch.html");
    wireToggle();
    toggle().setAttribute("aria-checked", "false");
    NS.hooks.youtube.update(ctx());
    NS.hooks.youtube.update(ctx({ active: false }));
    await flush();
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });

  it("does not fight the user on every DOM change", () => {
    mountFixture("youtube-watch.html");
    wireToggle();
    NS.hooks.youtube.update(ctx());
    toggle().closest("button").click(); // user turns it back on
    NS.hooks.youtube.update(ctx({ reason: "mutation" }));
    expect(toggle().getAttribute("aria-checked")).toBe("true");
  });

  it("waits until the toggle is rendered", () => {
    document.body.innerHTML = "";
    NS.hooks.youtube.update(ctx());
    mountFixture("youtube-watch.html");
    wireToggle();
    NS.hooks.youtube.update(ctx({ reason: "mutation" }));
    expect(toggle().getAttribute("aria-checked")).toBe("false");
  });
});

describe("YouTube titles", () => {
  it("replaces the tab title and restores the latest one", () => {
    mountFixture("youtube-watch.html");
    document.title = "Final match - YouTube";
    NS.hooks.youtube.update(ctx({}, { maskTitles: true }));
    expect(document.title).toBe(NS.youtube.TAB_TITLE);
    // YouTube navigates and sets a new title
    document.title = "Next video - YouTube";
    NS.hooks.youtube.update(ctx({ reason: "mutation" }, { maskTitles: true }));
    expect(document.title).toBe(NS.youtube.TAB_TITLE);
    NS.hooks.youtube.update(ctx({}, { maskTitles: false }));
    expect(document.title).toBe("Next video - YouTube");
  });

  it("removes title tooltips and restores them", () => {
    mountFixture("youtube-home.html");
    NS.hooks.youtube.update(ctx({}, { hideTooltips: true }));
    expect(document.querySelector("#video-title[title]")).toBeNull();
    NS.hooks.youtube.update(ctx({}, { hideTooltips: false }));
    expect(document.querySelector("#video-title").getAttribute("title")).toBe("A video");
  });
});
