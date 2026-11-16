import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hidingSelectors, isHidden, setHtmlClasses } from "./helpers/css.js";
import { fixture, flush, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS, api;
beforeEach(async () => {
  ({ NS, api } = await loadExtension(["platforms/youtube/content.js"]));
});

const FIXTURES = ["youtube-watch.html", "youtube-home.html"];
const JS_ONLY = ["disableAutoplay", "skipButtons", "overlayControls", "hideTooltips", "skipButtonSteps", "overlaySteps", "liveFromStart"];

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

describe("YouTube player time", () => {
  const PARTS = [".ytp-time-display", ".ytp-time-current", ".ytp-time-separator", ".ytp-time-duration"];
  function visibleParts(keys) {
    const hidden = render(NS, "youtube", "youtube-watch.html", keys);
    return PARTS.map((sel) => !hidden(document.querySelector(sel)));
  }

  it("hides current time and duration independently, the separator with either", () => {
    expect(visibleParts([])).toEqual([true, true, true, true]);
    expect(visibleParts(["hideCurrentTime"])).toEqual([true, false, false, true]);
    expect(visibleParts(["hideDuration"])).toEqual([true, true, false, false]);
    expect(visibleParts(["hideCurrentTime", "hideDuration"])).toEqual([false, false, false, false]);
  });

  it("keeps the Live badge visible on live streams while both halves are hidden", () => {
    for (const inWrapper of [false, true]) {
      const hidden = render(NS, "youtube", "youtube-watch.html", ["hideCurrentTime", "hideDuration"]);
      const display = document.querySelector(".ytp-time-display");
      display.classList.add("ytp-live");
      const parent = inWrapper ? display.querySelector(".ytp-time-wrapper") : display;
      parent.insertAdjacentHTML("beforeend", `<button class="ytp-live-badge ytp-button">Live</button>`);
      expect(hidden(document.querySelector(".ytp-live-badge")), `in wrapper: ${inWrapper}`).toBe(false);
      for (const sel of [".ytp-time-current", ".ytp-time-separator", ".ytp-time-duration"]) {
        expect(hidden(document.querySelector(sel)), sel).toBe(true);
      }
    }
  });

  it("masks the time left while the duration is hidden and unmarks it again", () => {
    mountFixture("youtube-watch.html");
    const current = document.querySelector(".ytp-time-current");
    current.textContent = "\u221243:43";
    NS.hooks.youtube.update(ctx({}, { hideCurrentTime: false, hideDuration: true }));
    expect(current.hasAttribute("data-ns-remaining")).toBe(true);
    expect(document.querySelectorAll("[data-ns-remaining]")).toHaveLength(1);

    current.textContent = "1:23";
    NS.hooks.youtube.update(ctx({ reason: "mutation" }, { hideCurrentTime: false, hideDuration: true }));
    expect(current.hasAttribute("data-ns-remaining")).toBe(false);

    current.textContent = "-43:43";
    NS.hooks.youtube.update(ctx({ reason: "mutation" }, { hideCurrentTime: false, hideDuration: true }));
    expect(current.hasAttribute("data-ns-remaining")).toBe(true);
    NS.hooks.youtube.update(ctx({}, { hideCurrentTime: false, hideDuration: false }));
    expect(current.hasAttribute("data-ns-remaining")).toBe(false);
  });

  it("hides the marked time left only with hide duration on", () => {
    const remainingHidden = (keys) => {
      const hidden = render(NS, "youtube", "youtube-watch.html", keys, { runJs: false });
      const current = document.querySelector(".ytp-time-current");
      current.setAttribute("data-ns-remaining", "");
      return hidden(current);
    };
    expect(remainingHidden(["hideDuration"])).toBe(true);
    expect(remainingHidden([])).toBe(false);
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

describe("YouTube live from the start", () => {
  // Values as measured on a live stream with a 12 h rewind window: the media
  // timeline starts one hour before the window, the seek bar counts from the
  // stream's first second.
  const LIVE_EDGE = 46800;
  const WINDOW = { min: 9451000, now: 9494200 };
  const WINDOW_START = LIVE_EDGE - (WINDOW.now - WINDOW.min);

  let pageId = 0;
  afterEach(() => vi.useRealTimers());

  /** Watch page fixture in the state the player renders for a live stream. */
  function mountLive({ live = true, badge = "Live", window = WINDOW } = {}) {
    history.pushState({}, "", `/watch?v=live${++pageId}`);
    mountFixture("youtube-watch.html");
    const display = document.querySelector(".ytp-time-display");
    if (live) {
      display.classList.add("ytp-live");
      display.insertAdjacentHTML("beforeend", `<button class="ytp-live-badge ytp-button">${badge}</button>`);
    }
    const bar = document.querySelector(".ytp-progress-bar");
    if (window) {
      bar.setAttribute("aria-valuemin", String(window.min));
      bar.setAttribute("aria-valuenow", String(window.now));
    }
    return fakeVideo(document.querySelector("#movie_player video"));
  }

  /** Replaces the media state of a jsdom <video>, which cannot play anything. */
  function fakeVideo(el) {
    const media = { el, readyState: 0, seeking: false, time: 0, muted: false, volume: 0.8, seeks: [] };
    const prop = (name, get, set) => Object.defineProperty(el, name, { configurable: true, get, set });
    prop("readyState", () => media.readyState);
    prop("seeking", () => media.seeking);
    prop("muted", () => media.muted, (v) => (media.muted = v));
    prop("volume", () => media.volume, (v) => (media.volume = v));
    prop("seekable", () => ({ length: 1, start: () => 0, end: () => LIVE_EDGE + 3600 }));
    prop("currentTime", () => media.time, (t) => {
      media.seeks.push(t);
      media.time = t;
      media.seeking = true;
    });
    return media;
  }

  const fire = (media, type) => media.el.dispatchEvent(new Event(type));

  /** What YouTube does on load: metadata, then its own seek to the live edge, then the first frame. */
  function loadToLiveEdge(media) {
    fire(media, "loadstart");
    media.readyState = 1;
    fire(media, "loadedmetadata");
    media.time = LIVE_EDGE;
    media.readyState = 4;
    fire(media, "seeked");
    fire(media, "playing");
  }

  function landSeek(media) {
    media.seeking = false;
    fire(media, "seeked");
  }

  const covered = () => document.querySelector("#movie_player").hasAttribute(NS.youtube.LIVE_COVER);
  const enable = (on = true) => NS.hooks.youtube.update(ctx({}, { liveFromStart: on }));

  /** Player or user sets the volume; the event arrives like in a browser. */
  function setVolume(media, value) {
    media.volume = value;
    fire(media, "volumechange");
  }

  it("covers and silences a live stream, seeks to the start of the rewind window and uncovers", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    expect(media.volume).toBe(0);

    media.readyState = 1;
    fire(media, "loadedmetadata");
    expect(media.seeks).toEqual([]); // the player's own seek to the live edge comes first

    media.time = LIVE_EDGE;
    media.readyState = 4;
    fire(media, "seeked");
    expect(media.seeks).toEqual([WINDOW_START]);
    expect(covered()).toBe(true);

    landSeek(media);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    expect(media.muted).toBe(false);
  });

  it("stays covered until a frame of the new position is ready", () => {
    const media = mountLive();
    enable();
    loadToLiveEdge(media);
    media.readyState = 1;
    landSeek(media);
    expect(covered()).toBe(true);
    media.readyState = 4;
    fire(media, "playing");
    expect(covered()).toBe(false);
  });

  it("silences again when the player restores its volume while loading and gives that volume back", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    setVolume(media, 0.5); // the player applies the saved volume
    expect(media.volume).toBe(0);
    loadToLiveEdge(media);
    landSeek(media);
    expect(media.volume).toBe(0.5);
  });

  it("leaves mute to the user: muting during the cover stays muted", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    media.muted = true; // the user presses "m" while the video is dark
    fire(media, "volumechange");
    loadToLiveEdge(media);
    landSeek(media);
    expect(covered()).toBe(false);
    expect(media.muted).toBe(true);
    expect(media.volume).toBe(0.8);
  });

  it("starts at the first second of a stream that is younger than the rewind window", () => {
    const media = mountLive({ window: { min: 0, now: 2874 } });
    enable();
    fire(media, "loadstart");
    media.readyState = 4;
    media.time = 2878;
    fire(media, "loadeddata");
    expect(media.seeks).toEqual([4]);
  });

  it("does nothing while the option is off", () => {
    const media = mountLive();
    enable(false);
    loadToLiveEdge(media);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    expect(media.seeks).toEqual([]);
  });

  it("does not jump back when the option is switched on while the stream is already showing", () => {
    const media = mountLive();
    enable(false);
    loadToLiveEdge(media);
    enable(true);
    fire(media, "playing");
    expect(media.seeks).toEqual([]);
    expect(covered()).toBe(false);
  });

  it("leaves videos, ended streams and premieres alone", () => {
    for (const setup of [{ live: false }, { badge: "Premiere" }]) {
      const media = mountLive(setup);
      enable();
      loadToLiveEdge(media);
      expect(covered(), JSON.stringify(setup)).toBe(false);
      expect(media.volume).toBe(0.8);
      expect(media.seeks).toEqual([]);
    }
  });

  it("plays a live stream without rewind window normally", () => {
    const media = mountLive({ window: { min: 9494200, now: 9494200 } });
    enable();
    loadToLiveEdge(media);
    expect(media.seeks).toEqual([]);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("seeks once per page and never fights the user afterwards", () => {
    const media = mountLive();
    enable();
    loadToLiveEdge(media);
    landSeek(media);
    expect(media.seeks).toHaveLength(1);

    // The user clicks "Live", the player reloads the media for the same page.
    media.time = LIVE_EDGE;
    fire(media, "seeked");
    NS.hooks.youtube.update(ctx({ reason: "mutation" }, { liveFromStart: true }));
    loadToLiveEdge(media);
    expect(media.seeks).toHaveLength(1);
    expect(covered()).toBe(false);

    // Navigating to another live stream (YouTube keeps the same player).
    history.pushState({}, "", "/watch?v=other");
    loadToLiveEdge(media);
    expect(media.seeks).toEqual([WINDOW_START, WINDOW_START]);
  });

  it("gives the player back after the timeout if the seek does not land", () => {
    vi.useFakeTimers();
    const media = mountLive();
    enable();
    loadToLiveEdge(media);
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(NS.youtube.LIVE_COVER_TIMEOUT_MS);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    loadToLiveEdge(media);
    expect(media.seeks).toHaveLength(1);
  });

  it("keeps the video muted if it was muted before", () => {
    const media = mountLive();
    media.muted = true;
    enable();
    loadToLiveEdge(media);
    landSeek(media);
    expect(media.muted).toBe(true);
  });

  it("does not cover ads and handles the stream after them", () => {
    const media = mountLive();
    enable();
    const playerEl = document.querySelector("#movie_player");
    playerEl.classList.add("ad-showing");
    loadToLiveEdge(media);
    expect(covered()).toBe(false);
    expect(media.seeks).toEqual([]);
    playerEl.classList.remove("ad-showing");
    loadToLiveEdge(media);
    expect(media.seeks).toEqual([WINDOW_START]);
  });

  it("removes the cover when protection is switched off", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    NS.hooks.youtube.update(ctx({ active: false }, { liveFromStart: true }));
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("starts the stream from the beginning again when coming back to it from another page", () => {
    const media = mountLive();
    const urlA = location.href;
    const display = document.querySelector(".ytp-time-display");
    const navigate = (url, isLive) => {
      history.pushState({}, "", url);
      display.classList.toggle("ytp-live", isLive);
      NS.hooks.youtube.update(ctx({ reason: "navigate" }, { liveFromStart: true }));
      loadToLiveEdge(media);
      landSeek(media);
    };
    enable();
    loadToLiveEdge(media);
    landSeek(media);
    expect(media.seeks).toEqual([WINDOW_START]);

    navigate("/watch?v=vod", false);
    expect(media.seeks).toEqual([WINDOW_START]);

    navigate(urlA, true);
    expect(media.seeks).toEqual([WINDOW_START, WINDOW_START]);
    expect(covered()).toBe(false);
  });

  it("gives the seek its own time when loading took most of the timeout", () => {
    vi.useFakeTimers();
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    vi.advanceTimersByTime(NS.youtube.LIVE_COVER_TIMEOUT_MS - 1000);
    media.readyState = 1;
    fire(media, "loadedmetadata");
    media.time = LIVE_EDGE;
    media.readyState = 4;
    fire(media, "seeked");
    expect(media.seeks).toEqual([WINDOW_START]);

    vi.advanceTimersByTime(2000);
    expect(covered()).toBe(true); // the first timeout alone would have shown the live edge here
    landSeek(media);
    expect(covered()).toBe(false);
  });

  it("never stays covered longer than the overall limit", () => {
    vi.useFakeTimers();
    const media = mountLive();
    enable();
    const { LIVE_COVER_TIMEOUT_MS, LIVE_COVER_MAX_MS } = NS.youtube;
    fire(media, "loadstart");
    vi.advanceTimersByTime(LIVE_COVER_TIMEOUT_MS - 1);
    media.time = LIVE_EDGE;
    media.readyState = 4;
    fire(media, "seeked");
    expect(media.seeks).toEqual([WINDOW_START]);

    vi.advanceTimersByTime(LIVE_COVER_MAX_MS - LIVE_COVER_TIMEOUT_MS);
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("recognises premieres by their label in several languages", () => {
    for (const badge of ["PREMIERE", "Première", "Estreno", "Estreia", "Премьера", "プレミア公開", "최초 공개", "首播"]) {
      const media = mountLive({ badge });
      enable();
      loadToLiveEdge(media);
      expect(media.seeks, badge).toEqual([]);
    }
    for (const badge of ["Live", "EN DIRECTO", "Ao vivo", "В эфире", "ライブ", "실시간", "直播"]) {
      const media = mountLive({ badge });
      enable();
      loadToLiveEdge(media);
      expect(media.seeks, badge).toEqual([WINDOW_START]);
    }
  });

  it("uncovers when this copy of the script is orphaned during the cover", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    delete api.runtime.id; // the extension was updated or removed
    fire(media, "loadedmetadata");
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("removes a cover left behind by an orphaned copy when a new copy starts", async () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    delete api.runtime.id;

    ({ NS, api } = await loadExtension(["platforms/youtube/content.js"]));
    enable();
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("hides the covered video with the stylesheet", () => {
    mountLive();
    const state = NS.defaultState();
    state.platforms.youtube.options.liveFromStart = true;
    setHtmlClasses(NS.classesFor(NS.getPlatform("youtube"), state));
    const video = document.querySelector("#movie_player video");
    const selectors = hidingSelectors("youtube");
    expect(isHidden(video, selectors)).toBe(false);
    document.querySelector("#movie_player").setAttribute(NS.youtube.LIVE_COVER, "");
    expect(isHidden(video, selectors)).toBe(true);
  });
});
