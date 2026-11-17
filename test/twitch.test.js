import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hidingSelectors, isHidden, setHtmlClasses } from "./helpers/css.js";
import { SRC, fixture, flush, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS, api;
const fixtureCss = () => readFileSync(path.join(SRC, "platforms", "twitch", "content.css"), "utf8");
beforeEach(async () => {
  ({ NS, api } = await loadExtension(["platforms/twitch/content.js"]));
});

const JS_ONLY = ["hideTooltips", "skipButtons", "overlayControls", "hideVodChatReplay", "hideLiveChat", "skipButtonSteps", "overlaySteps", "liveFromStart"];

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

  it("hides what each option promises on a live channel with rewind", () => {
    checkFixture(NS, "twitch", "twitch-live-rewind.html", { url: "https://www.twitch.tv/somechannel" });
  });

  it("covers every CSS option with a fixture expectation", () => {
    const covered = coveredOptions(["twitch-vod.html", "twitch-directory.html", "twitch-home.html", "twitch-live.html", "twitch-live-rewind.html"].map(fixture));
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

describe("Twitch player time", () => {
  const PARTS = [".vod-seekbar-time-labels", '[data-a-target="player-seekbar-current-time"]', '[data-a-target="player-seekbar-duration"]'];
  function visibleParts(keys) {
    const hidden = render(NS, "twitch", "twitch-vod.html", keys, { url: "https://www.twitch.tv/videos/123456" });
    return PARTS.map((sel) => !hidden(document.querySelector(sel)));
  }

  it("hides current time and duration independently", () => {
    expect(visibleParts([])).toEqual([true, true, true]);
    expect(visibleParts(["hideCurrentTime"])).toEqual([true, false, true]);
    expect(visibleParts(["hideDuration"])).toEqual([true, true, false]);
    expect(visibleParts(["hideCurrentTime", "hideDuration"])).toEqual([false, false, false]);
  });
});

describe("Twitch live player time", () => {
  const LIVE_URL = "https://www.twitch.tv/somechannel";
  const marked = () => [...document.querySelectorAll("[data-ns-live-time]")].map((e) => e.textContent.trim());

  it("marks the time and the distance to the live edge, not the LIVE badge or the seek bar", () => {
    mountFixture("twitch-live-rewind.html");
    document.querySelector('[data-a-target="player-seekbar"] .seekbar-bar').insertAdjacentHTML("beforeend", "<p>1:23</p>");
    NS.hooks.twitch.update(ctx({ url: LIVE_URL }, { hideLivePlayerTime: true }));
    expect(marked().sort()).toEqual(["-4:56:23", "00:00:19"]);
  });

  it("leaves the time row of videos and clips to its own options", () => {
    mountFixture("twitch-vod.html");
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/123456" }, { hideLivePlayerTime: true }));
    expect(marked()).toEqual([]);
    // A video playing on a channel page (offline channel, mini player) keeps its row too.
    NS.hooks.twitch.update(ctx({ url: LIVE_URL }, { hideLivePlayerTime: true }));
    expect(marked()).toEqual([]);
  });

  it("removes the marks when switched off or leaving for a video", () => {
    mountFixture("twitch-live.html");
    NS.hooks.twitch.update(ctx({ url: LIVE_URL }, { hideLivePlayerTime: true }));
    expect(marked()).toEqual(["00:02:17"]);
    NS.hooks.twitch.update(ctx({ url: LIVE_URL }, { hideLivePlayerTime: false }));
    expect(marked()).toEqual([]);
    NS.hooks.twitch.update(ctx({ url: LIVE_URL }, { hideLivePlayerTime: true }));
    NS.hooks.twitch.update(ctx({ reason: "navigate", url: "https://www.twitch.tv/videos/1" }, { hideLivePlayerTime: true }));
    expect(marked()).toEqual([]);
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
    // Only the channel name keeps its tooltip; it shows nothing the card does not.
    expect([...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"))).toEqual(["dirchannel"]);
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

describe("Twitch chat", () => {
  // Simulate Twitch: the toggle button flips the expanded class.
  function wireChat() {
    document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]').addEventListener("click", () => {
      document.querySelector(".channel-root__right-column").classList.toggle("channel-root__right-column--expanded");
    });
  }
  const expanded = () => document.querySelector(".channel-root__right-column--expanded") !== null;

  it("collapses the chat replay with Twitch's button and expands it again", async () => {
    mountFixture("twitch-vod.html");
    wireChat();
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1" }));
    expect(expanded()).toBe(false);
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/videos/1", active: false }));
    await flush();
    expect(expanded()).toBe(true);
  });

  it("keeps the chat collapsed while the option is on", () => {
    mountFixture("twitch-vod.html");
    wireChat();
    const c = ctx({ url: "https://www.twitch.tv/videos/1" });
    NS.hooks.twitch.update(c);
    document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]').click(); // Twitch opens it again
    expect(expanded()).toBe(true);
    NS.hooks.twitch.update({ ...c, reason: "mutation" });
    expect(expanded()).toBe(false);
  });

  it("hides the collapse button and the chat content while the option is on", () => {
    const hidden = render(NS, "twitch", "twitch-vod.html", ["hideVodChatReplay"], { url: "https://www.twitch.tv/videos/1", runJs: true });
    expect(hidden(document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]'))).toBe(true);
    expect(hidden(document.querySelector(".chat-shell"))).toBe(true);
    const live = render(NS, "twitch", "twitch-vod.html", ["hideLiveChat"], { url: "https://www.twitch.tv/videos/1" });
    expect(live(document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]'))).toBe(false);
  });

  it("leaves live chat open unless that option is on", () => {
    mountFixture("twitch-live.html");
    wireChat();
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/somechannel" }));
    expect(expanded()).toBe(true);
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/somechannel" }, { hideLiveChat: true }));
    expect(expanded()).toBe(false);
  });

  it("leaves a chat alone that the user had collapsed", async () => {
    mountFixture("twitch-live.html");
    wireChat();
    document.querySelector('[data-a-target="right-column__toggle-collapse-btn"]').click();
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/somechannel" }, { hideLiveChat: true }));
    NS.hooks.twitch.update(ctx({ url: "https://www.twitch.tv/somechannel", active: false }));
    await flush();
    expect(expanded()).toBe(false);
  });
});

describe("Twitch live from the start", () => {
  const RECT = { left: 100, right: 900, top: 500, bottom: 510, width: 800, height: 10, x: 100, y: 500 };
  const NO_BOX = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  const POINTER_SEQUENCE = ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"];

  let channelId = 0;
  beforeEach(() => {
    // jsdom under vitest rejects its global proxy as an event's view; the browser takes it.
    for (const name of ["PointerEvent", "MouseEvent"]) {
      const Original = window[name];
      vi.stubGlobal(name, function (type, { view, ...init } = {}) {
        return new Original(type, init);
      });
    }
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    localStorage.clear();
  });

  /** Replaces the media state of a jsdom <video>, which cannot play anything. */
  function fakeVideo(el) {
    const media = { el, readyState: 0, seeking: false, muted: false, volume: 0.8 };
    const prop = (name, get, set) => Object.defineProperty(el, name, { configurable: true, get, set });
    prop("readyState", () => media.readyState);
    prop("seeking", () => media.seeking);
    prop("muted", () => media.muted, (v) => (media.muted = v));
    prop("volume", () => media.volume, (v) => (media.volume = v));
    return media;
  }

  /**
   * Live channel page. With `rewind` the player has the seek bar of Turbo
   * users, twice like on the site; only the second one is laid out.
   */
  function mountLive({ rewind = true, channel = `chan${++channelId}`, laidOut = true } = {}) {
    history.pushState({}, "", `/${channel}`);
    mountFixture(rewind ? "twitch-live-rewind.html" : "twitch-live.html");
    const media = fakeVideo(document.querySelector("video"));
    media.events = [];
    media.clicks = [];
    const bars = [...document.querySelectorAll('[data-a-target="player-seekbar"]')];
    media.box = laidOut ? RECT : NO_BOX;
    bars.forEach((bar, i) => {
      bar.getBoundingClientRect = () => (i === bars.length - 1 ? media.box : NO_BOX);
    });
    media.bar = bars.at(-1) ?? null;
    if (media.bar) {
      for (const type of [...POINTER_SEQUENCE, "pointerout", "pointerleave", "mouseout", "mouseleave"]) {
        media.bar.addEventListener(type, (e) => media.events.push(e.type));
      }
      media.bar.addEventListener("click", (e) => media.clicks.push([e.clientX, e.clientY, e.isTrusted]));
    }
    return media;
  }

  const fire = (media, type) => media.el.dispatchEvent(new Event(type));
  const covered = () => document.querySelector('[data-a-target="video-player"]').hasAttribute(NS.twitch.LIVE_COVER);
  const enable = (on = true, extra = {}) => NS.hooks.twitch.update(ctx({ url: location.href, ...extra }, { liveFromStart: on }));

  function setPlayed(media, width) {
    media.bar.querySelector('[data-test-selector="seekbar-segment__segment"]').style.width = width;
  }

  /** What the player does when it starts a stream. */
  function play(media) {
    fire(media, "loadstart");
    media.readyState = 4;
    fire(media, "playing");
  }

  /** What Twitch does after the click: the bar shows the start, the media is loaded again from there. */
  function landJump(media) {
    setPlayed(media, "0.106844%");
    media.readyState = 0;
    fire(media, "loadstart");
    media.readyState = 4;
    fire(media, "playing");
  }

  it("covers and silences a live stream, clicks the start of the seek bar and uncovers after the jump", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    expect(media.volume).toBe(0);
    expect(media.muted).toBe(false);

    media.readyState = 4;
    fire(media, "playing");
    expect(media.clicks).toEqual([[RECT.left + 2, RECT.top + RECT.height / 2, false]]);
    expect(media.events).toEqual([...POINTER_SEQUENCE, "pointerout", "pointerleave", "mouseout", "mouseleave"]);
    expect(covered()).toBe(true);

    landJump(media);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("clicks only the laid-out copy of the duplicated seek bar", () => {
    const media = mountLive();
    const hidden = document.querySelector('[data-a-target="player-seekbar"]');
    const clicks = [];
    hidden.addEventListener("click", () => clicks.push("hidden"));
    enable();
    play(media);
    expect(clicks).toEqual([]);
    expect(media.clicks).toHaveLength(1);
  });

  it("stays covered until the seek bar shows the start and the new position has a frame", () => {
    const media = mountLive();
    enable();
    play(media);
    fire(media, "playing"); // still the live edge
    expect(covered()).toBe(true);
    setPlayed(media, "0.106844%");
    fire(media, "playing"); // bar moved, but no frame from there yet
    expect(covered()).toBe(true);
    media.seeking = true;
    fire(media, "seeked");
    expect(covered()).toBe(true);
    media.seeking = false;
    fire(media, "seeked");
    expect(covered()).toBe(false);
  });

  it("waits for the seek bar to be laid out", () => {
    vi.useFakeTimers();
    const media = mountLive({ laidOut: false });
    enable();
    play(media);
    expect(media.clicks).toEqual([]);
    vi.advanceTimersByTime(1000);
    media.box = RECT; // the controls are shown
    vi.advanceTimersByTime(250);
    expect(media.clicks).toHaveLength(1);
  });

  it("uncovers a stream without seek bar (no rewind rights) and leaves it alone afterwards", () => {
    vi.useFakeTimers();
    const media = mountLive({ rewind: false });
    enable();
    play(media);
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(NS.twitch.LIVE_SEEKBAR_WAIT_MS - 1);
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);

    play(media); // quality change
    expect(covered()).toBe(false);
  });

  it("does not jump back after the user clicked Live", () => {
    const media = mountLive();
    enable();
    play(media);
    landJump(media);
    setPlayed(media, "100%");
    play(media); // the player loads the live edge
    NS.hooks.twitch.update(ctx({ reason: "mutation", url: location.href }, { liveFromStart: true }));
    expect(media.clicks).toHaveLength(1);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("starts again from the beginning on another channel and when coming back", () => {
    const media = mountLive({ channel: "first" });
    enable();
    play(media);
    landJump(media);
    const navigate = (path) => {
      history.pushState({}, "", path);
      setPlayed(media, "100%");
      NS.hooks.twitch.update(ctx({ reason: "navigate", url: location.href }, { liveFromStart: true }));
      play(media);
      landJump(media);
    };
    navigate("/second");
    expect(media.clicks).toHaveLength(2);
    navigate("/directory");
    expect(media.clicks).toHaveLength(2);
    navigate("/first");
    expect(media.clicks).toHaveLength(3);
    expect(covered()).toBe(false);
  });

  it("gives the player back after the timeout if the jump does not land", () => {
    vi.useFakeTimers();
    const media = mountLive();
    enable();
    play(media);
    expect(media.clicks).toHaveLength(1);
    vi.advanceTimersByTime(NS.liveCover.TIMEOUT_MS - 1);
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    play(media);
    expect(media.clicks).toHaveLength(1);
  });

  it("does nothing while the option is off", () => {
    const media = mountLive();
    enable(false);
    play(media);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    expect(media.clicks).toEqual([]);
  });

  it("does not jump when the option is switched on while the stream is showing", () => {
    const media = mountLive();
    enable(false);
    play(media);
    enable(true);
    fire(media, "playing");
    expect(media.clicks).toEqual([]);
    expect(covered()).toBe(false);
  });

  it("leaves videos, clips and the home page player alone", () => {
    for (const path of ["/videos/123", "/chan/clip/Slug-1", "/directory"]) {
      const media = mountLive();
      history.pushState({}, "", path);
      enable();
      play(media);
      expect(covered(), path).toBe(false);
      expect(media.clicks, path).toEqual([]);
    }
    const media = mountLive();
    document.querySelector('[data-a-target="video-player"]').setAttribute("data-a-player-type", "frontpage");
    enable();
    play(media);
    expect(covered()).toBe(false);
    expect(media.clicks).toEqual([]);
  });

  it("puts back the volume Twitch saved while the stream was silenced", () => {
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0.8");
    const media = mountLive();
    enable();
    play(media);
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0"); // the player saves the silenced volume
    landJump(media);
    expect(localStorage.getItem(NS.twitch.VOLUME_STORAGE_KEY)).toBe("0.8");
  });

  it("keeps a volume the user saved during the cover", () => {
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0.8");
    const media = mountLive();
    enable();
    play(media);
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0.3");
    landJump(media);
    expect(localStorage.getItem(NS.twitch.VOLUME_STORAGE_KEY)).toBe("0.3");
  });

  it("gives the volume back when the page is left during the cover", () => {
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0.8");
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0");
    window.dispatchEvent(new Event("pagehide"));
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
    expect(localStorage.getItem(NS.twitch.VOLUME_STORAGE_KEY)).toBe("0.8");
  });

  it("removes a silenced volume Twitch saved for the first time during the cover", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    localStorage.setItem(NS.twitch.VOLUME_STORAGE_KEY, "0");
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem(NS.twitch.VOLUME_STORAGE_KEY)).toBeNull();
  });

  /** Twitch changes the URL first; the next channel's media loads after that. */
  function navigateTo(channel) {
    history.pushState({}, "", `/${channel}`);
    enable(true, { reason: "navigate" });
  }

  it("does not click the previous channel's seek bar after navigating to another channel", () => {
    vi.useFakeTimers();
    const media = mountLive({ channel: "first", laidOut: false });
    enable();
    play(media);
    navigateTo("second");
    media.box = RECT; // the old player's controls are laid out only now
    vi.advanceTimersByTime(250);
    expect(media.clicks).toEqual([]);

    play(media); // the second channel's stream
    expect(media.clicks).toHaveLength(1);
  });

  it("covers the next channel when navigating while waiting for a seek bar", () => {
    vi.useFakeTimers();
    const media = mountLive({ channel: "first", rewind: false });
    enable();
    play(media);
    vi.advanceTimersByTime(NS.twitch.LIVE_SEEKBAR_WAIT_MS - 100);
    navigateTo("second");
    // Until the second channel's media loads, this is still the first channel's live edge.
    expect(covered()).toBe(true);
    expect(media.volume).toBe(0);
    vi.advanceTimersByTime(250);
    expect(covered()).toBe(true);
    fire(media, "loadstart"); // the second channel's stream
    expect(covered()).toBe(true);
  });

  it("gives the previous channel's player back after the timeout when no new load comes", () => {
    vi.useFakeTimers();
    const media = mountLive({ channel: "first", rewind: false });
    enable();
    play(media);
    navigateTo("second");
    expect(covered()).toBe(true);
    vi.advanceTimersByTime(NS.liveCover.TIMEOUT_MS);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("gives the previous channel's player back once its video is gone", () => {
    const media = mountLive({ channel: "first", rewind: false });
    enable();
    play(media);
    navigateTo("second");
    expect(covered()).toBe(true);
    media.el.remove();
    enable(true, { reason: "mutation" });
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("stops waiting for the jump once the page was left", () => {
    vi.useFakeTimers();
    const media = mountLive();
    enable();
    play(media);
    window.dispatchEvent(new Event("pagehide"));
    fire(media, "playing");
    expect(vi.getTimerCount()).toBe(0);
    expect(covered()).toBe(false);
  });

  it("does not click from an orphaned copy and gives the player back", () => {
    vi.useFakeTimers();
    const media = mountLive({ laidOut: false });
    enable();
    play(media);
    delete api.runtime.id; // the extension was updated or removed
    media.box = RECT;
    vi.advanceTimersByTime(250);
    expect(media.clicks).toEqual([]);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("removes the cover when protection is switched off", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    enable(true, { active: false });
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("recognises channel pages", () => {
    const { liveChannel } = NS.twitch;
    expect(liveChannel("https://www.twitch.tv/Some_Channel")).toBe("some_channel");
    expect(liveChannel("https://www.twitch.tv/somechannel/")).toBe("somechannel");
    for (const url of ["https://www.twitch.tv/", "https://www.twitch.tv/videos/1", "https://www.twitch.tv/chan/clip/x", "https://www.twitch.tv/chan/videos", "https://www.twitch.tv/directory", "https://clips.twitch.tv/Slug", "nope"]) {
      expect(liveChannel(url), url).toBeNull();
    }
  });

  describe("stylesheet", () => {
    function withStyles(keys) {
      const state = NS.defaultState();
      for (const k of keys) state.platforms.twitch.options[k] = true;
      setHtmlClasses(NS.classesFor(NS.getPlatform("twitch"), state));
      const style = document.createElement("style");
      style.textContent = fixtureCss();
      document.head.appendChild(style);
    }

    it("hides the covered video", () => {
      mountLive();
      withStyles(["liveFromStart"]);
      const video = document.querySelector("video");
      const selectors = hidingSelectors("twitch");
      expect(isHidden(video, selectors)).toBe(false);
      document.querySelector('[data-a-target="video-player"]').setAttribute(NS.twitch.LIVE_COVER, "1");
      expect(isHidden(video, selectors)).toBe(true);
    });

    it("keeps a hidden seek bar in the layout while covered, invisible", () => {
      const media = mountLive();
      withStyles(["liveFromStart", "hideSeekbar"]);
      expect(getComputedStyle(media.bar).display).toBe("none");
      document.querySelector('[data-a-target="video-player"]').setAttribute(NS.twitch.LIVE_COVER, "1");
      expect(getComputedStyle(media.bar).display).not.toBe("none");
      expect(getComputedStyle(media.bar).visibility).toBe("hidden");
    });
  });
});
