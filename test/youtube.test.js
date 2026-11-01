import { beforeEach, describe, expect, it } from "vitest";
import { fixture, flush, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS, api;
beforeEach(async () => {
  ({ NS, api } = await loadExtension(["platforms/youtube/content.js"]));
});

const FIXTURES = ["youtube-watch.html", "youtube-home.html"];
const JS_ONLY = ["disableAutoplay", "skipButtons", "hideTooltips"];

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

describe("YouTube skip buttons", () => {
  it("inserts exactly one set, also after repeated updates and navigation", () => {
    mountFixture("youtube-watch.html");
    const c = ctx({}, { skipButtons: true });
    NS.hooks.youtube.update(c);
    NS.hooks.youtube.update({ ...c, reason: "mutation" });
    NS.hooks.youtube.update({ ...c, reason: "navigate" });
    NS.hooks.youtube.update({ ...c, reason: "state" });
    const sets = document.querySelectorAll(".ns-skip-controls");
    expect(sets).toHaveLength(1);
    expect(sets[0].previousElementSibling.classList.contains("ytp-play-button")).toBe(true);
    expect([...sets[0].querySelectorAll("button")].map((b) => b.textContent)).toEqual(["−10", "−5", "+5", "+10"]);
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

  it("skips within the video bounds", () => {
    mountFixture("youtube-watch.html");
    const player = document.querySelector(".html5-video-player");
    const video = player.querySelector("video");
    Object.defineProperty(video, "duration", { value: 1000, configurable: true });
    video.currentTime = 200;
    NS.youtube.skip(player, -300);
    expect(video.currentTime).toBe(0);
    NS.youtube.skip(player, 600);
    expect(video.currentTime).toBe(600);
    NS.youtube.skip(player, 600);
    expect(video.currentTime).toBe(1000);
  });

  it("clicking a button seeks the player's video", () => {
    mountFixture("youtube-watch.html");
    NS.hooks.youtube.update(ctx({}, { skipButtons: true }));
    const video = document.querySelector("video");
    video.currentTime = 100;
    document.querySelectorAll(".ns-skip-controls button")[2].click();
    expect(video.currentTime).toBe(400);
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
