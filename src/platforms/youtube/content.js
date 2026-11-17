/*
 * YouTube: the parts CSS cannot do.
 * - Marks thumbnail badges that are not durations, so CSS can show them again.
 * - Marks the time left in the player, which gives the duration away.
 * - Inserts skip buttons and the centre overlay (core/player-controls.js).
 * - Switches autoplay off and back on.
 * - Replaces the tab title and removes title tooltips.
 * - Starts live streams at the beginning of their rewind window.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const { dom } = NS;

  const SEL = {
    badges: [
      "ytd-thumbnail-overlay-time-status-renderer",
      "yt-thumbnail-badge-view-model",
      "yt-thumbnail-view-model badge-shape",
    ],
    // Old layouts without a dedicated badge element: plain text inside the thumbnail
    badgeText: ["ytd-thumbnail #overlays span", "ytd-thumbnail #overlays div"],
    playButton: [".html5-video-player .ytp-play-button"],
    timeDisplay: [".ytp-time-display"],
    player: ["#movie_player", ".html5-video-player"],
    tooltips: [
      "#video-title[title]",
      "#video-title-link[title]",
      ".yt-lockup-metadata-view-model__title[title]",
      "ytd-watch-metadata #title [title]",
    ],
    autoplayToggle: [".ytp-autonav-toggle-button[aria-checked]", "[data-tooltip-target-id='ytp-autonav-toggle-button'] [aria-checked]"],
    mainVideo: "#movie_player video",
    liveTimeDisplay: [".ytp-time-display.ytp-live"],
    liveBadge: [".ytp-live-badge"],
    progressBar: [".ytp-progress-bar[aria-valuenow]"],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
  const REMAINING = "data-ns-remaining";
  const AUTOPLAY_RESTORE_KEY = "youtube.autoplayRestore";

  /* -------------------------- thumbnail badges ------------------------- */

  function markBadges(doc) {
    for (const el of dom.queryAll(doc, SEL.badges)) {
      const text = el.textContent.trim();
      // Empty badges stay hidden until their text is rendered (fail closed).
      if (text && !dom.isDuration(text)) el.setAttribute(KEEP, "");
      else el.removeAttribute(KEEP);
    }
    for (const el of dom.queryAll(doc, SEL.badgeText)) {
      if (el.children.length === 0 && dom.isDuration(el.textContent)) {
        dom.badgeFor(el, el.closest("ytd-thumbnail")).setAttribute(DURATION, "");
      }
    }
  }

  function unmarkBadges(doc) {
    dom.clearAttr(doc, KEEP);
    dom.clearAttr(doc, DURATION);
  }

  /* ----------------------------- time left ----------------------------- */

  // Matched by text, not by class: the time left may reuse the current time element.
  function markRemainingTime(doc) {
    for (const display of dom.queryAll(doc, SEL.timeDisplay)) {
      for (const el of display.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
        const text = el.textContent.trim();
        const remaining = /^[-\u2212]/.test(text) && dom.isDuration(text.slice(1));
        el.toggleAttribute(REMAINING, remaining);
      }
    }
  }

  /* --------------------------- seek controls --------------------------- */

  const videoOf = (playerEl) => () => playerEl.querySelector("video");

  /** Idempotent: at most one skip bar per control bar. */
  function ensureSkipButtons(doc, amounts) {
    for (const playBtn of dom.queryAll(doc, SEL.playButton)) {
      const playerEl = playBtn.closest(".html5-video-player");
      if (playerEl) NS.player.ensureSkipBar(doc, playBtn, videoOf(playerEl), amounts);
    }
  }

  /** Idempotent: at most one overlay per player. */
  function ensureOverlay(doc, amounts) {
    for (const playerEl of dom.queryAll(doc, SEL.player)) {
      if (playerEl.querySelector(".ytp-play-button")) NS.player.ensureOverlay(doc, playerEl, videoOf(playerEl), amounts);
    }
  }

  /* ----------------------------- tab title ----------------------------- */

  const TAB_TITLE = "YouTube";
  let originalTabTitle = null;

  /** Replaces the tab title; YouTube rewrites it on navigation, so this runs on every tick. */
  function maskTabTitle(doc) {
    if (doc.title !== TAB_TITLE) {
      originalTabTitle = doc.title;
      doc.title = TAB_TITLE;
    }
  }

  function restoreTabTitle(doc) {
    if (originalTabTitle !== null && doc.title === TAB_TITLE) doc.title = originalTabTitle;
    originalTabTitle = null;
  }

  /* ------------------------------ autoplay ----------------------------- */

  let autoplayPending = true;

  function findAutoplayToggle(doc) {
    return dom.queryFirst(doc, SEL.autoplayToggle);
  }

  function clickToggle(toggle) {
    (toggle.closest("button") || toggle).click();
  }

  /**
   * Switches autoplay off while active. Remembers (in storage.local, so any
   * tab can undo it) that we switched it, and switches it back on only then.
   * Returns false while the toggle is not rendered yet.
   */
  function reconcileAutoplay(ctx) {
    const toggle = findAutoplayToggle(ctx.document);
    if (!toggle) return false;
    const isOn = toggle.getAttribute("aria-checked") === "true";
    const storage = NS.api.storage.local;

    if (ctx.active && ctx.options.disableAutoplay) {
      if (isOn) {
        clickToggle(toggle);
        storage.set({ [AUTOPLAY_RESTORE_KEY]: true });
      }
      return true;
    }

    storage.get(AUTOPLAY_RESTORE_KEY).then((data) => {
      if (!data[AUTOPLAY_RESTORE_KEY]) return;
      const current = findAutoplayToggle(ctx.document);
      if (current && current.getAttribute("aria-checked") === "false") clickToggle(current);
      storage.remove(AUTOPLAY_RESTORE_KEY);
    });
    return true;
  }

  /* ------------------------ live from the start ------------------------ */

  /*
   * The player API (seekTo, getVideoData) lives in the page and is out of
   * reach for a content script, so this works on the <video> element and on
   * what the player renders: the time display carries "ytp-live" on live
   * streams, and the seek bar's aria values are seconds on the stream
   * timeline, so valuenow - valuemin is how far the rewind window reaches
   * back from the current position.
   *
   * Every media load of the main player (loadstart) is looked at once. While
   * it is a live stream, the video is covered and silenced until the seek has
   * landed and a frame of the new position is ready. Each visit of a page is
   * handled once: a later reload of the media, the "Live" button or a seek
   * by the user is left alone. Covering and silencing: core/live-cover.js.
   */
  const LIVE_COVER = NS.liveCover.ATTR;
  // A shorter rewind window is not worth a seek.
  const LIVE_MIN_REWIND_SECONDS = 30;
  // Premieres carry "ytp-live" too. The page offers the content script no
  // language-independent sign of a premiere, so this matches the badge label
  // in the languages known here; an unknown label is treated as a live stream.
  const PREMIERE_RE = /premi|estreno|estreia|prömiyer|премьер|премиер|прем.єр|プレミア|최초 공개|首播|首映/i;
  const LIVE_MEDIA_EVENTS = ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "seeked", "volumechange"];

  const live = {
    ctx: null, // latest update context, read by the media event handler
    listening: null, // document with the media listeners
    load: null, // { video, seekTarget, finished } of the current media load
    doneUrl: null, // page handled last; forgotten when navigating to another page
  };

  const liveCover = NS.liveCover.create({
    onTimeout(playerEl) {
      live.doneUrl = currentUrl(playerEl.ownerDocument);
      finishLoad();
    },
  });

  function liveOptionOn(ctx) {
    return Boolean(ctx && ctx.active && ctx.options.liveFromStart);
  }

  /** "live", "premiere" or null for everything else (videos, ended streams). */
  function liveKind(playerEl) {
    if (!dom.queryFirst(playerEl, SEL.liveTimeDisplay)) return null;
    const badge = dom.queryFirst(playerEl, SEL.liveBadge);
    return badge && PREMIERE_RE.test(badge.textContent) ? "premiere" : "live";
  }

  /** Earliest position the stream can be rewound to, or null without a usable rewind window. */
  function rewindStart(playerEl, video) {
    const bar = dom.queryFirst(playerEl, SEL.progressBar);
    if (!bar || !bar.hasAttribute("aria-valuemin")) return null;
    const behind = Number(bar.getAttribute("aria-valuenow")) - Number(bar.getAttribute("aria-valuemin"));
    if (!Number.isFinite(behind) || behind < LIVE_MIN_REWIND_SECONDS) return null;
    const earliest = video.seekable && video.seekable.length ? video.seekable.start(0) : 0;
    return Math.max(earliest, video.currentTime - behind);
  }

  function finishLoad() {
    if (live.load) live.load.finished = true;
    liveCover.uncover();
  }

  function currentUrl(doc) {
    return doc.location ? doc.location.href : live.ctx?.url;
  }

  function evaluateLive() {
    const load = live.load;
    if (!load || load.finished) return;
    const video = load.video;
    if (!liveOptionOn(live.ctx)) {
      // Once the stream has been on screen, switching the option on must not jump back.
      // Before that the settings may simply not be read yet.
      if (video.readyState >= 2) finishLoad();
      else liveCover.uncover();
      return;
    }
    const playerEl = video.isConnected ? video.closest(".html5-video-player") : null;
    if (!playerEl) {
      finishLoad();
      return;
    }
    // Ads are no spoilers; the stream is looked at once they are over.
    if (playerEl.classList.contains("ad-showing")) {
      liveCover.uncover();
      return;
    }
    if (load.seekTarget !== null) {
      // Uncover only once a frame of the new position can be shown.
      if (!video.seeking && video.readyState >= 2) finishLoad();
      return;
    }

    const kind = liveKind(playerEl);
    if (kind !== "live") {
      if (kind === "premiere" || video.readyState >= 1) finishLoad();
      return;
    }
    const url = currentUrl(playerEl.ownerDocument);
    if (live.doneUrl === url) {
      finishLoad();
      return;
    }
    liveCover.cover(playerEl, video);
    // The player first seeks to the live edge itself; seeking before that would be overridden.
    if (video.readyState < 2 || video.seeking) return;

    live.doneUrl = url;
    const target = rewindStart(playerEl, video);
    if (target === null) {
      finishLoad();
      return;
    }
    load.seekTarget = target;
    video.currentTime = target;
    // Loading may have used up most of the time; the seek gets its own.
    liveCover.arm();
  }

  function onMediaEvent(event) {
    const doc = event.currentTarget;
    if (root.NoSpoiler !== NS || NS.isContextInvalid()) {
      // A newer copy of this script took over, or the extension is gone.
      for (const type of LIVE_MEDIA_EVENTS) doc.removeEventListener(type, onMediaEvent, true);
      liveCover.uncover();
      return;
    }
    const video = event.target;
    if (!video.matches?.(SEL.mainVideo)) return;
    if (event.type === "volumechange") {
      liveCover.onVolumeChange(video);
      return;
    }
    if (event.type === "loadstart") {
      liveCover.uncover();
      live.load = { video, seekTarget: null, finished: false };
    }
    if (live.load?.video === video) evaluateLive();
  }

  function updateLiveStart(ctx) {
    live.ctx = ctx;
    if (live.listening !== ctx.document) {
      NS.liveCover.clearStale(ctx.document);
      // Media events do not bubble; capturing on the document sees every <video>.
      for (const type of LIVE_MEDIA_EVENTS) ctx.document.addEventListener(type, onMediaEvent, true);
      live.listening = ctx.document;
    }
    // Coming back to a page later is a new visit.
    if (ctx.reason === "navigate" && live.doneUrl !== currentUrl(ctx.document)) live.doneUrl = null;
    evaluateLive();
  }

  /* -------------------------------- hook ------------------------------- */

  NS.definePlatform("youtube", {
    navigationEvents: ["yt-navigate-finish"],

    update(ctx) {
      const doc = ctx.document;
      const opts = ctx.options;

      if (ctx.active && opts.hideThumbnailDurations) markBadges(doc);
      else if (ctx.reason === "state") unmarkBadges(doc);

      if (ctx.active && opts.hideDuration) markRemainingTime(doc);
      else if (ctx.reason === "state") dom.clearAttr(doc, REMAINING);

      if (ctx.active && opts.skipButtons) ensureSkipButtons(doc, opts.skipButtonSteps);
      else if (ctx.reason === "state") NS.player.remove(doc, "skip-bar");

      if (ctx.active && opts.overlayControls) ensureOverlay(doc, opts.overlaySteps);
      else if (ctx.reason === "state") NS.player.remove(doc, "overlay");

      if (ctx.active && opts.maskTitles) maskTabTitle(doc);
      else if (ctx.reason === "state") restoreTabTitle(doc);

      if (ctx.active && opts.hideTooltips) dom.stashTitles(doc, SEL.tooltips);
      else if (ctx.reason === "state") dom.restoreTitles(doc);

      if (ctx.reason === "state" || ctx.reason === "navigate") autoplayPending = true;
      if (autoplayPending && reconcileAutoplay(ctx)) autoplayPending = false;

      updateLiveStart(ctx);
    },
  });

  // Exposed for tests.
  NS.youtube = { SEL, markBadges, markRemainingTime, ensureSkipButtons, ensureOverlay, AUTOPLAY_RESTORE_KEY, TAB_TITLE, LIVE_COVER, LIVE_COVER_TIMEOUT_MS: NS.liveCover.TIMEOUT_MS, LIVE_COVER_MAX_MS: NS.liveCover.MAX_MS };
})(globalThis);
