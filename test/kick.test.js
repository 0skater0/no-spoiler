import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture, flush, loadExtension, mountFixture } from "./helpers/env.js";
import { checkFixture, coveredOptions, render } from "./helpers/fixture-check.js";

let NS;
beforeEach(async () => {
  ({ NS } = await loadExtension(["platforms/kick/content.js"]));
});

const VOD_URL = "https://kick.com/somechannel/videos/01a1e637-1908-7fa4-8f9e-dff87ded45b6";
const CLIP_URL = "https://kick.com/somechannel/clips/clip_01H14R3YHR19FXXWG11REP7HXA";
const LIVE_URL = "https://kick.com/somechannel";
const JS_ONLY = ["hideTooltips", "skipButtons", "overlayControls", "skipButtonSteps", "overlaySteps", "liveFromStart"];

function ctx(overrides = {}, optionOverrides = {}) {
  const state = NS.defaultState();
  Object.assign(state.platforms.kick.options, optionOverrides);
  return { reason: "state", active: true, options: state.platforms.kick.options, document, url: "https://kick.com/", state, ...overrides };
}

describe("Kick stylesheet", () => {
  it("hides what each option promises on a video page", () => {
    checkFixture(NS, "kick", "kick-vod.html", { url: VOD_URL });
  });

  it("hides what each option promises on a live channel", () => {
    checkFixture(NS, "kick", "kick-live.html", { url: LIVE_URL });
  });

  it("hides what each option promises on card lists", () => {
    checkFixture(NS, "kick", "kick-cards.html", { url: "https://kick.com/somechannel/videos" });
  });

  it("hides what each option promises in the clip dialog", () => {
    checkFixture(NS, "kick", "kick-clip-dialog.html", { url: "https://kick.com/somechannel/clips" });
  });

  it("hides what each option promises on a live channel's sub-pages", () => {
    checkFixture(NS, "kick", "kick-channel-tab.html", { url: "https://kick.com/somechannel/videos" });
  });

  it("covers every CSS option with a fixture expectation", () => {
    const covered = coveredOptions(["kick-vod.html", "kick-live.html", "kick-cards.html", "kick-clip-dialog.html", "kick-channel-tab.html"].map(fixture));
    const keys = NS.getPlatform("kick").options.map((o) => o.key).filter((k) => !JS_ONLY.includes(k));
    for (const k of keys) expect(covered.has(k), k).toBe(true);
  });

  it("hides card badges until they are checked (fail closed)", () => {
    const hidden = render(NS, "kick", "kick-cards.html", ["hideCardDurations"], { runJs: false });
    for (const el of document.querySelectorAll("[data-expect-keep]")) expect(hidden(el)).toBe(true);
  });

  it("hides the player times until they are checked (fail closed)", () => {
    for (const key of ["hideCurrentTime", "hideDuration", "hideLiveUptime"]) {
      const hidden = render(NS, "kick", "kick-vod.html", [key], { url: VOD_URL, runJs: false });
      const labels = [...document.querySelectorAll(".tabular-nums")].filter((el) => !el.closest(".group\\/seekbar"));
      expect(labels).toHaveLength(2);
      for (const el of labels) expect(hidden(el), key).toBe(true);
    }
  });
});

describe("Kick ads", () => {
  // During a pre-roll ad (live site, 2026-11-17) the box around the video holds an ad progress bar and the volume slider.
  const AD = '<div id="ad-box"><video id="video-player"></video><div><span role="slider" aria-label="Volume"></span></div><div role="progressbar" aria-label="Ad progress"></div></div>';

  it("does not take the player for the seek bar while an ad plays", () => {
    const hidden = render(NS, "kick", "kick-live.html", ["hideSeekbar", "hideSeekbarPreview"], { url: LIVE_URL });
    document.querySelector("#injected-embedded-channel-player-video").insertAdjacentHTML("beforeend", AD);
    expect(hidden(document.querySelector("#ad-box"))).toBe(false);
    expect(hidden(document.querySelector("#ad-box > div"))).toBe(false);
  });

  it("does not seek with the volume slider while an ad plays", () => {
    mountFixture("kick-live.html");
    document.querySelector(".group\\/seekbar").remove();
    document.querySelector("#injected-embedded-channel-player-video").insertAdjacentHTML("beforeend", AD);
    expect(NS.kick.SEL.seekSlider.map((s) => document.querySelector(s))).toEqual([null]);
  });
});

describe("Kick player time", () => {
  const marks = () => [...document.querySelectorAll("[data-ns-time]")].map((e) => [e.textContent.trim(), e.getAttribute("data-ns-time")]);

  it("tells current time and duration apart on videos", () => {
    mountFixture("kick-vod.html");
    NS.hooks.kick.update(ctx({ url: VOD_URL }));
    expect(marks()).toEqual([
      ["00:31", "current"],
      ["05:53:36", "duration"],
    ]);
    // The seek bar's hover label is left to hideSeekbarPreview.
    expect(document.querySelector(".group\\/seekbar [data-ns-time]")).toBeNull();
  });

  it("hides current time and duration independently, the separator only with both", () => {
    const visible = (keys) => {
      const hidden = render(NS, "kick", "kick-vod.html", keys, { url: VOD_URL });
      const [current, duration] = document.querySelectorAll("[data-ns-time]");
      return [!hidden(current), !hidden(duration)];
    };
    expect(visible([])).toEqual([true, true]);
    expect(visible(["hideCurrentTime"])).toEqual([false, true]);
    expect(visible(["hideDuration"])).toEqual([true, false]);
    expect(visible(["hideCurrentTime", "hideDuration"])).toEqual([false, false]);
    expect(document.querySelector("[data-ns-time-row]")).not.toBeNull();
  });

  it("marks the uptime of a live stream", () => {
    mountFixture("kick-live.html");
    NS.hooks.kick.update(ctx({ url: LIVE_URL }));
    expect(marks()).toEqual([["03:39:42", "live"]]);
  });

  it("marks the combined label of the clip dialog for both options", () => {
    mountFixture("kick-clip-dialog.html");
    NS.hooks.kick.update(ctx({ url: "https://kick.com/somechannel/clips" }));
    expect(marks()).toEqual([["00:05 / 00:17", "both"]]);
  });

  it("removes the marks when switched off", () => {
    mountFixture("kick-vod.html");
    NS.hooks.kick.update(ctx({ url: VOD_URL }));
    NS.hooks.kick.update(ctx({ url: VOD_URL }, { hideCurrentTime: false, hideDuration: false, hideLiveUptime: false }));
    expect(document.querySelector("[data-ns-time], [data-ns-time-row]")).toBeNull();
  });
});

describe("Kick page type", () => {
  it("detects videos, clips and other pages", () => {
    const { pageType } = NS.kick;
    expect(pageType(VOD_URL)).toBe("vod");
    expect(pageType("https://kick.com/video/01a1e637-1908-7fa4-8f9e-dff87ded45b6")).toBe("vod");
    expect(pageType(CLIP_URL)).toBe("clip");
    expect(pageType("https://kick.com/somechannel?clip=clip_01H14R3YHR19FXXWG11REP7HXA")).toBe("clip");
    expect(pageType(LIVE_URL)).toBe("other");
    expect(pageType("https://kick.com/somechannel/videos")).toBe("other");
    expect(pageType("https://kick.com/somechannel/clips")).toBe("other");
    expect(pageType("not a url")).toBe("other");
  });

  it("recognises channel pages", () => {
    const { liveChannel } = NS.kick;
    expect(liveChannel("https://kick.com/SomeChannel")).toBe("somechannel");
    expect(liveChannel("https://kick.com/some-channel/")).toBe("some-channel");
    expect(liveChannel(VOD_URL)).toBeNull();
    expect(liveChannel("https://kick.com/category/chess")).toBeNull();
  });
});

describe("Kick card durations", () => {
  it("marks durations by text and keeps the other badges", () => {
    mountFixture("kick-cards.html");
    NS.kick.markDurations(document);
    expect([...document.querySelectorAll("[data-ns-duration]")].map((e) => e.textContent.trim()).sort()).toEqual(["00:17", "05:53:36"]);
    for (const el of document.querySelectorAll("[data-expect-keep]")) expect(el.hasAttribute("data-ns-keep")).toBe(true);
  });

  it("removes the marks when switched off", () => {
    mountFixture("kick-cards.html");
    NS.hooks.kick.update(ctx());
    expect(document.querySelector("[data-ns-duration]")).not.toBeNull();
    NS.hooks.kick.update(ctx({ active: false }));
    expect(document.querySelector("[data-ns-duration], [data-ns-keep]")).toBeNull();
  });
});

describe("Kick tooltips", () => {
  it("removes title tooltips of titles and restores them", () => {
    mountFixture("kick-cards.html");
    const before = [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"));
    NS.hooks.kick.update(ctx({}, { hideTooltips: true }));
    const after = [...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"));
    expect(after).not.toContain("Road to grandmaster, day 12");
    expect(after).not.toContain("Grand final, map 5");
    expect(after).not.toContain("Insane clutch");
    // Names, counts and dates keep theirs.
    expect(after).toContain("somechannel");
    expect(after).toContain("12017");
    NS.hooks.kick.update(ctx({}, { hideTooltips: false }));
    expect([...document.querySelectorAll("[title]")].map((e) => e.getAttribute("title"))).toEqual(before);
  });

  it("removes the tooltip of the title under the player", () => {
    mountFixture("kick-vod.html");
    NS.hooks.kick.update(ctx({ url: VOD_URL }, { hideTooltips: true }));
    expect(document.querySelector('[data-testid="livestream-title"]').hasAttribute("title")).toBe(false);
  });

  it("keeps the clip dialog's title masked once its tooltip is gone", () => {
    const hidden = render(NS, "kick", "kick-clip-dialog.html", ["maskTitles", "hideTooltips"], { url: "https://kick.com/somechannel/clips" });
    const title = document.querySelector('[role="dialog"] [data-ns-title="Insane clutch"]');
    expect(title).not.toBeNull();
    expect(hidden(title)).toBe(true);
  });
});

describe("Kick seek controls", () => {
  it("adds skip bar and overlay on video pages only, once", () => {
    mountFixture("kick-vod.html");
    const c = ctx({ url: VOD_URL }, { skipButtons: true, overlayControls: true });
    NS.hooks.kick.update(c);
    NS.hooks.kick.update({ ...c, reason: "mutation" });
    expect(document.querySelectorAll('[data-ns-player="skip-bar"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-ns-player="overlay"]')).toHaveLength(1);
    const bar = document.querySelector('[data-ns-player="skip-bar"]');
    expect(bar.previousElementSibling.getAttribute("aria-label")).toBe("Pause (space)");
    expect(document.querySelector('[data-ns-player="overlay"]').parentElement.id).toBe("injected-channel-player");

    NS.hooks.kick.update({ ...c, reason: "navigate", url: LIVE_URL });
    expect(document.querySelector("[data-ns-player]")).toBeNull();
  });

  it("leaves live streams alone", () => {
    mountFixture("kick-live.html");
    NS.hooks.kick.update(ctx({ url: LIVE_URL }, { skipButtons: true, overlayControls: true }));
    expect(document.querySelector("[data-ns-player]")).toBeNull();
  });

  it("the overlay seeks the player's video", () => {
    mountFixture("kick-vod.html");
    NS.hooks.kick.update(ctx({ url: VOD_URL }, { overlayControls: true }));
    const video = document.querySelector("video#video-player");
    video.currentTime = 100;
    const buttons = [...document.querySelectorAll('[data-ns-player="overlay"] button')];
    buttons.find((b) => b.textContent === "+1m").click();
    expect(video.currentTime).toBe(160);
  });
});

describe("Kick chat", () => {
  // Simulate Kick: collapsing and reopening flip data-chat on the page root.
  function wireChat() {
    const rootEl = document.querySelector("[data-chat]");
    document.querySelector('#channel-chatroom button[aria-label="Collapse chat"]').addEventListener("click", () => rootEl.setAttribute("data-chat", "false"));
    document.querySelector('[class*="group-data-[chat=false]/main:block"] button').addEventListener("click", () => rootEl.setAttribute("data-chat", "true"));
  }
  const open = () => document.querySelector("[data-chat]").getAttribute("data-chat") === "true";

  it("collapses the chat replay with Kick's button and opens it again", () => {
    mountFixture("kick-vod.html");
    wireChat();
    NS.hooks.kick.update(ctx({ url: VOD_URL }));
    expect(open()).toBe(false);
    NS.hooks.kick.update(ctx({ url: VOD_URL, active: false }));
    expect(open()).toBe(true);
  });

  it("keeps the chat collapsed while the option is on", () => {
    mountFixture("kick-vod.html");
    wireChat();
    const c = ctx({ url: VOD_URL });
    NS.hooks.kick.update(c);
    document.querySelector('[class*="group-data-[chat=false]/main:block"] button').click();
    expect(open()).toBe(true);
    NS.hooks.kick.update({ ...c, reason: "mutation" });
    expect(open()).toBe(false);
  });

  it("opens the chat again when leaving the video for a live channel", () => {
    mountFixture("kick-vod.html");
    wireChat();
    NS.hooks.kick.update(ctx({ url: VOD_URL }));
    NS.hooks.kick.update(ctx({ url: LIVE_URL, reason: "navigate" }));
    expect(open()).toBe(true);
  });

  it("leaves the live chat and a chat the user collapsed alone", async () => {
    mountFixture("kick-vod.html");
    wireChat();
    document.querySelector('#channel-chatroom button[aria-label="Collapse chat"]').click();
    NS.hooks.kick.update(ctx({ url: LIVE_URL }));
    await flush();
    expect(open()).toBe(false);
  });
});

describe("Kick live from the start", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Replaces the media state of a jsdom <video>, which cannot play anything. */
  function fakeVideo(el) {
    const media = { el, readyState: 0, seeking: false, duration: NaN, currentTime: 13181, volume: 0.8 };
    const prop = (name) => Object.defineProperty(el, name, { configurable: true, get: () => media[name], set: (v) => (media[name] = v) });
    ["readyState", "seeking", "duration", "currentTime", "volume"].forEach(prop);
    return media;
  }

  /** Live channel page with the hovered control bar; `controls: false` removes it until Kick would mount it. */
  function mountLive({ controls = true, url = LIVE_URL } = {}) {
    history.pushState({}, "", new URL(url).pathname);
    mountFixture("kick-live.html");
    const media = fakeVideo(document.querySelector("video#video-player"));
    media.keys = [];
    media.moves = 0;
    const bar = document.querySelector(".group\\/seekbar").parentElement;
    const parent = bar.parentElement;
    media.el.addEventListener("mousemove", () => media.moves++);
    document.querySelector('[role="slider"][aria-label="Current video time"]').addEventListener("keydown", (e) => media.keys.push(e.key));
    if (!controls) bar.remove();
    media.mountControls = () => parent.append(bar);
    return media;
  }

  const fire = (media, type) => media.el.dispatchEvent(new Event(type));
  const covered = () => document.querySelector("#injected-channel-player").hasAttribute(NS.kick.LIVE_COVER);
  const enable = (on = true) => NS.hooks.kick.update(ctx({ url: location.href }, { liveFromStart: on }));

  function playLive(media) {
    fire(media, "loadstart");
    media.duration = Infinity;
    media.readyState = 4;
    fire(media, "playing");
  }

  /** What Kick does after the Home key: the recording of the stream loads from its start. */
  function landJump(media) {
    media.readyState = 0;
    media.duration = NaN;
    fire(media, "loadstart");
    media.duration = 13748;
    media.currentTime = 0.8;
    media.readyState = 4;
    fire(media, "playing");
  }

  it("covers and silences a live stream, seeks to its start with the Home key and uncovers once it plays from there", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    expect(covered()).toBe(true);
    expect(media.volume).toBe(0);

    media.duration = Infinity;
    media.readyState = 4;
    fire(media, "playing");
    expect(media.moves).toBeGreaterThan(0);
    expect(media.keys).toEqual(["Home"]);
    expect(covered()).toBe(true);

    landJump(media);
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("waits for the control bar Kick mounts on the mouse move", () => {
    vi.useFakeTimers();
    const media = mountLive({ controls: false });
    enable();
    playLive(media);
    expect(media.keys).toEqual([]);
    media.mountControls();
    vi.advanceTimersByTime(250);
    expect(media.keys).toEqual(["Home"]);
  });

  it("gives up and plays live when no seek bar comes", () => {
    vi.useFakeTimers();
    const media = mountLive({ controls: false });
    enable();
    playLive(media);
    vi.advanceTimersByTime(NS.kick.LIVE_SEEKBAR_WAIT_MS + 300);
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  it("does not jump back after the user went back to live", () => {
    const media = mountLive();
    enable();
    playLive(media);
    landJump(media);
    // "Go to LIVE" loads the live stream again.
    media.keys.length = 0;
    playLive(media);
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  it("leaves a finished video on the channel page alone", () => {
    const media = mountLive();
    enable();
    fire(media, "loadstart");
    media.duration = 21216;
    media.readyState = 4;
    fire(media, "playing");
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  it("still starts the next channel from the beginning when the previous channel's recording loads once more after the switch", () => {
    const media = mountLive();
    enable();
    playLive(media);
    expect(media.keys).toEqual(["Home"]);
    history.pushState({}, "", "/otherchannel");
    NS.hooks.kick.update(ctx({ url: location.href, reason: "navigate" }, { liveFromStart: true }));
    // Seen on the live site (2026-11-17): under the new URL the old channel's recording loads before the new stream.
    media.readyState = 0;
    media.duration = NaN;
    fire(media, "loadstart");
    media.duration = 13748;
    media.readyState = 4;
    fire(media, "playing");
    expect(covered()).toBe(false);

    media.keys.length = 0;
    media.readyState = 0;
    media.duration = NaN;
    playLive(media);
    expect(covered()).toBe(true);
    expect(media.keys).toEqual(["Home"]);
  });

  it("keeps the previous channel covered when navigating while waiting for the seek bar", () => {
    vi.useFakeTimers();
    const media = mountLive({ controls: false });
    enable();
    playLive(media);
    vi.advanceTimersByTime(1000);
    history.pushState({}, "", "/otherchannel");
    NS.hooks.kick.update(ctx({ url: location.href, reason: "navigate" }, { liveFromStart: true }));
    // Until the next channel's media loads, this is still the previous channel's live edge.
    expect(covered()).toBe(true);
    expect(media.volume).toBe(0);
    vi.advanceTimersByTime(NS.kick.LIVE_SEEKBAR_WAIT_MS);
    expect(covered()).toBe(true);
    media.mountControls();
    vi.advanceTimersByTime(250);
    expect(media.keys).toEqual([]);

    media.readyState = 0;
    media.duration = NaN;
    playLive(media); // the next channel's stream
    expect(covered()).toBe(true);
    expect(media.keys).toEqual(["Home"]);
  });

  it("gives the previous channel's player back once its video is gone", () => {
    vi.useFakeTimers();
    const media = mountLive({ controls: false });
    enable();
    playLive(media);
    history.pushState({}, "", "/otherchannel");
    NS.hooks.kick.update(ctx({ url: location.href, reason: "navigate" }, { liveFromStart: true }));
    expect(covered()).toBe(true);
    media.el.remove();
    NS.hooks.kick.update(ctx({ url: location.href, reason: "mutation" }, { liveFromStart: true }));
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });

  it("starts the stream from the beginning again when an ad interrupts the jump", () => {
    const media = mountLive();
    enable();
    playLive(media);
    expect(media.keys).toEqual(["Home"]);
    // The ad plays in the player's video, with a finite duration from 0.
    media.el.insertAdjacentHTML("afterend", '<div role="progressbar" aria-label="Ad progress"></div>');
    media.readyState = 0;
    media.duration = NaN;
    fire(media, "loadstart");
    media.duration = 15;
    media.currentTime = 0.5;
    media.readyState = 4;
    fire(media, "playing");
    expect(covered()).toBe(false);

    document.querySelector('[aria-label="Ad progress"]').remove();
    media.readyState = 0;
    media.duration = NaN;
    playLive(media);
    expect(covered()).toBe(true);
    expect(media.keys).toEqual(["Home", "Home"]);
  });

  it("does not jump back after going live when the recording played after an ad", () => {
    const media = mountLive();
    enable();
    playLive(media);
    media.el.insertAdjacentHTML("afterend", '<div role="progressbar" aria-label="Ad progress"></div>');
    media.readyState = 0;
    media.duration = NaN;
    fire(media, "loadstart");
    media.duration = 15;
    media.currentTime = 0.5;
    media.readyState = 4;
    fire(media, "playing");
    document.querySelector('[aria-label="Ad progress"]').remove();
    // After the ad Kick goes on with the recording the jump asked for.
    landJump(media);
    expect(covered()).toBe(false);
    // "Go to LIVE" loads the live stream again.
    media.keys.length = 0;
    media.readyState = 0;
    media.duration = NaN;
    playLive(media);
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  it("follows the player's video without its id", () => {
    const media = mountLive();
    media.el.removeAttribute("id");
    enable();
    playLive(media);
    expect(covered()).toBe(true);
    expect(media.keys).toEqual(["Home"]);
  });

  it("does nothing while the option is off", () => {
    const media = mountLive();
    enable(false);
    playLive(media);
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  it("leaves video pages alone", () => {
    const media = mountLive({ url: VOD_URL });
    enable();
    playLive(media);
    expect(covered()).toBe(false);
    expect(media.keys).toEqual([]);
  });

  describe("saved volume", () => {
    // Kick keeps the player volume in a cookie and saves the silenced 0 there during the cover (live site, 2026-11-17).
    const volumeCookie = () => document.cookie.split("; ").find((c) => c.startsWith(`${NS.kick.VOLUME_COOKIE}=`))?.split("=")[1] ?? null;
    const saveVolume = (v) => (document.cookie = `${NS.kick.VOLUME_COOKIE}=${v}; path=/`);
    afterEach(() => {
      document.cookie = `${NS.kick.VOLUME_COOKIE}=; path=/; max-age=0`;
    });

    it("puts back the volume Kick saved while the stream was silenced", () => {
      saveVolume("0.8");
      const media = mountLive();
      enable();
      playLive(media);
      saveVolume("0");
      landJump(media);
      expect(volumeCookie()).toBe("0.8");
    });

    it("keeps a volume the user saved during the cover", () => {
      saveVolume("0.8");
      const media = mountLive();
      enable();
      playLive(media);
      saveVolume("0.3");
      landJump(media);
      expect(volumeCookie()).toBe("0.3");
    });

    it("gives the volume back when the page is left during the cover", () => {
      saveVolume("0.8");
      const media = mountLive();
      enable();
      fire(media, "loadstart");
      saveVolume("0");
      window.dispatchEvent(new Event("pagehide"));
      expect(covered()).toBe(false);
      expect(media.volume).toBe(0.8);
      expect(volumeCookie()).toBe("0.8");
    });

    // Kick saves while a media load starts, not on every volume change, so its 0 can come after the cover is gone.
    it("takes back a 0 Kick saves after the cover is gone", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      playLive(media);
      landJump(media);
      expect(covered()).toBe(false);
      saveVolume("0");
      vi.advanceTimersByTime(NS.liveCover.STORE_RECHECK_MS);
      expect(volumeCookie()).toBe("0.8");
    });

    it("keeps the volume to give back when a late 0 meets the next cover", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      // Live site, channel switch: the previous channel's recording is covered and given back right away,
      // Kick then mutes the player at volume 0 itself and saves the 0 seconds later, before the new stream loads.
      fire(media, "loadstart");
      media.duration = 13748;
      media.readyState = 4;
      fire(media, "playing");
      expect(covered()).toBe(false);
      // The click on the next channel's link lies outside the player.
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      media.volume = 0;
      fire(media, "volumechange");
      vi.advanceTimersByTime(5000);
      saveVolume("0");
      vi.advanceTimersByTime(2000);
      media.readyState = 0;
      media.duration = NaN;
      playLive(media);
      expect(covered()).toBe(true);
      landJump(media);
      expect(volumeCookie()).toBe("0.8");
      expect(media.volume).toBe(0.8);
    });

    /** Covers and gives back the previous channel's recording, as after a channel switch. */
    function passRecording(media) {
      fire(media, "loadstart");
      media.duration = 13748;
      media.readyState = 4;
      fire(media, "playing");
      expect(covered()).toBe(false);
    }

    /** The user moves the volume slider in the player's control bar. */
    function userSetsVolume(media, volume) {
      const slider = document.querySelector('#injected-channel-player [role="slider"]');
      slider.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      media.volume = volume;
      fire(media, "volumechange");
      slider.dispatchEvent(new Event("pointerup", { bubbles: true }));
    }

    function nextStream(media) {
      media.readyState = 0;
      media.duration = NaN;
      playLive(media);
      expect(covered()).toBe(true);
      landJump(media);
    }

    it("leaves a 0 the user set on the player before the next stream", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      passRecording(media);
      userSetsVolume(media, 0);
      vi.advanceTimersByTime(5000);
      saveVolume("0");
      vi.advanceTimersByTime(2000);
      nextStream(media);
      expect(volumeCookie()).toBe("0");
      expect(media.volume).toBe(0);
    });

    it("does not put the old volume back when the user changes it right after the cover", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      passRecording(media);
      userSetsVolume(media, 0.5);
      saveVolume("0");
      vi.advanceTimersByTime(NS.liveCover.STORE_RECHECK_MS);
      expect(volumeCookie()).toBe("0.5");
    });

    it("gives back the volume the user set before Kick's late 0", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      passRecording(media);
      userSetsVolume(media, 0.5);
      vi.advanceTimersByTime(3000);
      media.volume = 0;
      fire(media, "volumechange");
      saveVolume("0");
      vi.advanceTimersByTime(2000);
      nextStream(media);
      expect(media.volume).toBe(0.5);
      expect(volumeCookie()).toBe("0.5");
    });

    it("leaves a 0 the user chose after the cover", () => {
      vi.useFakeTimers();
      saveVolume("0.8");
      const media = mountLive();
      enable();
      playLive(media);
      landJump(media);
      media.volume = 0;
      saveVolume("0");
      vi.advanceTimersByTime(NS.liveCover.STORE_RECHECK_MS);
      expect(volumeCookie()).toBe("0");
    });

    it("removes a silenced volume Kick saved for the first time during the cover", () => {
      const media = mountLive();
      enable();
      fire(media, "loadstart");
      saveVolume("0");
      window.dispatchEvent(new Event("pagehide"));
      expect(volumeCookie()).toBeNull();
    });
  });

  it("removes the cover when protection is switched off", () => {
    const media = mountLive({ controls: false });
    enable();
    playLive(media);
    expect(covered()).toBe(true);
    NS.hooks.kick.update(ctx({ url: location.href, active: false }, { liveFromStart: true }));
    expect(covered()).toBe(false);
    expect(media.volume).toBe(0.8);
  });
});
