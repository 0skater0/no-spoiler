/*
 * Kick: the parts CSS cannot do.
 * - Page type (vod, clip, other) as data attribute on <html> for scoped rules.
 * - Marks the player's time labels by their text: current time, duration, stream uptime.
 * - Marks durations on video and clip cards by their text, and keeps the other badges visible.
 * - Moves title tooltips away and back.
 * - Inserts skip buttons and the centre overlay on videos and clips.
 * - Collapses the chat replay with Kick's own button.
 * - Starts live streams at the beginning with Kick's rewind.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const { dom } = NS;

  const SEL = {
    // A div with the "loaded" progress bar as direct child and the seek slider inside, in every Kick player.
    // During an ad the box around the video has a progress bar and the volume slider too.
    seekbar: 'div:has(> [role="progressbar"]):has([role="slider"]):not(:has(video))',
    seekSlider: ['div:has(> [role="progressbar"]):not(:has(video)) [role="slider"]'],
    adProgress: 'video ~ [role="progressbar"]',
    channelPlayer: "#injected-channel-player",
    // The player's own video; the ad player next to it is an aria-hidden <video>.
    playerVideo: ["video#video-player", "video:not([aria-hidden])"],
    // Thumbnails of video and clip cards; their badges are direct children.
    cardThumbs: [
      '[data-testid="vods-card"] [data-testid="media-card-thumbnail"]',
      'a[data-testid="media-card-thumbnail"][href*="/videos/"]',
      '[data-testid="clips-card"] [data-focus-target] > button',
    ],
    chatOpen: '[data-chat="true"]',
    chatClosed: '[data-chat="false"]',
    chatCollapse: ['#channel-chatroom button[aria-label="Collapse chat"]'],
    // Shown by Kick only while the chat is collapsed (see content.css).
    chatReopen: ['[class*="group-data-[chat=false]/main:block"] button'],
    tooltips: [
      '[data-testid="livestream-results-card"] a[title]:has(h3)',
      '[data-testid="vods-card"] a[title]:has(h3)',
      '[data-testid="clips-card"] h3 [title]',
      '[data-testid="livestream-title"][title]',
      '[role="dialog"] span[title]:has(+ span + a[href^="/category/"])',
    ],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
  const TIME = "data-ns-time";
  const TIME_ROW = "data-ns-time-row";
  const PAGE = "data-ns-page";

  /** vod, clip or other, from the URL. */
  function pageType(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return "other";
    }
    if (/^\/[^/]+\/videos\/[^/]+/.test(u.pathname) || /^\/video\/[^/]+/.test(u.pathname)) return "vod";
    if (/^\/[^/]+\/clips\/[^/]+/.test(u.pathname) || u.searchParams.has("clip")) return "clip";
    return "other";
  }

  /* ------------------------------ durations ---------------------------- */

  function markDurations(doc) {
    for (const thumb of dom.queryAll(doc, SEL.cardThumbs)) {
      for (const badge of thumb.children) {
        if (badge.tagName !== "DIV" || badge.querySelector("img, video")) continue;
        if (dom.isDuration(badge.textContent)) badge.removeAttribute(KEEP);
        else badge.setAttribute(KEEP, "");
      }
      for (const el of thumb.querySelectorAll("*")) {
        if (el.children.length === 0 && dom.isDuration(el.textContent)) {
          dom.badgeFor(el, thumb).setAttribute(DURATION, "");
        }
      }
    }
  }

  function unmarkDurations(doc) {
    dom.clearAttr(doc, KEEP);
    dom.clearAttr(doc, DURATION);
  }

  /* ----------------------------- player time --------------------------- */

  // "05:53:36", "00:17" and, while rewound on a live stream, "-02:38:03".
  const TIME_RE = /^[-−]?\d{1,2}:\d{2}(?::\d{2})?$/;
  // The clip dialog shows both in one label: "00:05 / 00:17".
  const TIME_PAIR_RE = /^\d{1,2}:\d{2}(?::\d{2})?\s*\/\s*\d{1,2}:\d{2}(?::\d{2})?$/;

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  /**
   * The time labels have no attribute of their own, so they are told apart
   * by their text and their number in the control bar (the seek bar's
   * parent): two labels are current time and duration (videos and clips),
   * one label is the uptime of a live stream, or the position once it was
   * rewound. Labels in the seek bar belong to its hover preview.
   */
  function markPlayerTime(doc, page) {
    for (const bar of dom.queryAll(doc, [SEL.seekbar])) {
      const controls = bar.parentElement;
      if (!controls) continue;
      const leaves = [...controls.querySelectorAll("span")].filter((el) => el.children.length === 0 && !bar.contains(el));
      const times = leaves.filter((el) => TIME_RE.test(el.textContent.trim()) || TIME_PAIR_RE.test(el.textContent.trim()));
      times.forEach((el, i) => {
        let kind;
        if (TIME_PAIR_RE.test(el.textContent.trim())) kind = "both";
        else if (times.length >= 2) kind = i === 0 ? "current" : "duration";
        else kind = page === "other" ? "live" : "both";
        setAttr(el, TIME, kind);
      });
      if (times.length >= 2 && times[0].parentElement === times[1].parentElement) setAttr(times[0].parentElement, TIME_ROW, "");
      // Other tabular-nums spans are released from the fail-closed rule.
      for (const el of leaves) if (!times.includes(el) && el.classList.contains("tabular-nums")) setAttr(el, TIME, "other");
    }
  }

  function unmarkPlayerTime(doc) {
    dom.clearAttr(doc, TIME);
    dom.clearAttr(doc, TIME_ROW);
  }

  /* --------------------------- seek controls --------------------------- */

  const videoOf = (container) => () => dom.queryFirst(container, SEL.playerVideo);

  function ensureSkipButtons(doc, amounts) {
    for (const container of dom.queryAll(doc, [SEL.channelPlayer])) {
      const bar = container.querySelector(SEL.seekbar);
      // The play button opens the left group of the control bar; the bar only exists while hovered.
      const playBtn = bar?.parentElement?.firstElementChild?.querySelector(":scope > button");
      if (playBtn) NS.player.ensureSkipBar(doc, playBtn, videoOf(container), amounts);
    }
  }

  function ensureOverlay(doc, amounts) {
    for (const container of dom.queryAll(doc, [SEL.channelPlayer])) NS.player.ensureOverlay(doc, container, videoOf(container), amounts);
  }

  /* -------------------------------- chat ------------------------------- */

  // Kick keeps the collapsed chat in memory only, so a page load starts with it open.
  let collapsedByUs = false;

  /** Keeps the chat collapsed with Kick's own button; runs on every tick, so a chat opened again is collapsed right away. */
  function enforceCollapsed(doc) {
    if (!doc.querySelector(SEL.chatOpen)) return;
    const button = dom.queryFirst(doc, SEL.chatCollapse);
    if (!button) return;
    button.click();
    collapsedByUs = true;
  }

  /** Opens the chat again if the extension collapsed it. */
  function restoreChat(doc) {
    if (!collapsedByUs) return;
    if (!doc.querySelector(SEL.chatClosed)) {
      collapsedByUs = false;
      return;
    }
    const button = dom.queryFirst(doc, SEL.chatReopen);
    if (!button) return;
    button.click();
    collapsedByUs = false;
  }

  /* ------------------------ live from the start ------------------------ */

  /*
   * Kick keeps the whole running stream rewindable, also without an account.
   * Its seek bar is a Radix slider: the Home key on it seeks to the start of
   * the stream, and the player switches to a recording of the stream with a
   * finite duration. The control bar only exists while the player is hovered,
   * so a mouse move over the video brings it up first.
   *
   * Every media load of the channel player is looked at once. The video is
   * covered and silenced (core/live-cover.js) until it plays from the start.
   * Each visit of a channel is handled once: "Go to LIVE", quality changes or
   * reloads afterwards are left alone.
   */
  const LIVE_COVER = NS.liveCover.ATTR;
  // How long a stream that already plays stays covered waiting for the seek bar.
  const LIVE_SEEKBAR_WAIT_MS = 3000;
  // The recording loads without DOM mutations the runtime would see.
  const LIVE_POLL_MS = 250;
  // After the jump the position counts from the start of the stream.
  const LIVE_START_MAX_S = 60;
  // Kick saves the player volume in this cookie while a media load starts, so also the silenced 0 of the
  // cover, sometimes only after the cover is gone; see core/live-cover.js.
  const VOLUME_COOKIE = "volume";
  const LIVE_MEDIA_EVENTS = ["loadstart", "loadedmetadata", "loadeddata", "canplay", "playing", "seeked", "durationchange", "volumechange"];

  const live = {
    ctx: null, // latest update context, read by the media event handler
    listening: null, // document with the media listeners
    load: null, // { video, playingSince, sent, channel, abandoned, finished } of the current media load
    doneChannel: null, // channel handled last; forgotten when navigating to another page
    adChannel: null, // channel whose jump an ad interrupted; a recording there afterwards is the jump landing
    poll: null,
  };

  const liveCover = NS.liveCover.create({
    volumeStore: NS.liveCover.cookieStore(VOLUME_COOKIE),
    recheckStore: true,
    onTimeout() {
      live.doneChannel = live.load?.channel ?? null;
      finishLoad();
    },
  });

  /** Lower-case channel name of a channel's main page, or null for every other page. */
  function liveChannel(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    const m = /^\/([\w-]+)\/?$/.exec(u.pathname);
    return m ? m[1].toLowerCase() : null;
  }

  function liveOptionOn(ctx) {
    return Boolean(ctx && ctx.active && ctx.options.liveFromStart);
  }

  function currentUrl(doc) {
    return doc.location ? doc.location.href : live.ctx?.url;
  }

  /** A live stream has no end; a recording or a finished video has one. */
  const isLiveMedia = (video) => video.duration === Infinity;

  /** Kick mounts the control bar on a mouse move over the video. */
  function showControls(video) {
    const rect = video.getBoundingClientRect();
    const MouseEventCtor = video.ownerDocument.defaultView?.MouseEvent ?? root.MouseEvent;
    video.dispatchEvent(new MouseEventCtor("mousemove", { bubbles: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
  }

  function seekToStreamStart(slider) {
    const KeyboardEventCtor = slider.ownerDocument.defaultView?.KeyboardEvent ?? root.KeyboardEvent;
    slider.dispatchEvent(new KeyboardEventCtor("keydown", { key: "Home", code: "Home", bubbles: true, cancelable: true }));
  }

  function stopPoll() {
    if (live.poll !== null) clearTimeout(live.poll);
    live.poll = null;
  }

  function schedulePoll() {
    if (live.poll === null) {
      live.poll = setTimeout(() => {
        live.poll = null;
        evaluateLive();
      }, LIVE_POLL_MS);
    }
  }

  function uncover() {
    stopPoll();
    liveCover.uncover();
  }

  function finishLoad() {
    if (live.load) live.load.finished = true;
    uncover();
  }

  function evaluateLive() {
    const load = live.load;
    if (!load || load.finished) return;
    if (root.NoSpoiler !== NS || NS.isContextInvalid()) {
      // Orphaned copy: a poll must not seek on behalf of a script that is gone.
      uncover();
      return;
    }
    const video = load.video;
    if (!liveOptionOn(live.ctx)) {
      // Once the stream has been on screen, switching the option on must not jump back.
      // Before that the settings may simply not be read yet.
      if (video.readyState >= 2) finishLoad();
      else uncover();
      return;
    }
    const playerEl = video.isConnected ? video.closest(SEL.channelPlayer) : null;
    if (load.abandoned) {
      // Covered until the next load starts, the video goes or the safety timeout gives it back.
      if (!playerEl) finishLoad();
      return;
    }
    const channel = playerEl ? liveChannel(currentUrl(playerEl.ownerDocument)) : null;
    if (!channel) {
      finishLoad();
      return;
    }
    // Kick changes the URL before the next channel's media loads; until then
    // this media is still the previous channel's, maybe at its live edge, so
    // the attempt ends but a cover stays.
    load.channel ??= channel;
    if (channel !== load.channel) {
      if (liveCover.isCovered()) {
        load.abandoned = true;
        stopPoll();
      } else {
        finishLoad();
      }
      return;
    }
    if (load.sent && playerEl.querySelector(SEL.adProgress)) {
      // An ad interrupted the jump; its finite duration from 0 would pass for the start.
      // The stream after it gets a new attempt.
      load.sent = false;
      load.playingSince = null;
      live.doneChannel = null;
      live.adChannel = channel;
    }
    if (load.sent) {
      // Uncovered by leaving the page or switching the option off: nothing left to wait for.
      if (!liveCover.isCovered()) {
        finishLoad();
        return;
      }
      const atStart = !isLiveMedia(video) && Number.isFinite(video.duration) && video.currentTime <= LIVE_START_MAX_S;
      if (atStart && !video.seeking && video.readyState >= 2) finishLoad();
      else schedulePoll();
      return;
    }
    if (live.doneChannel === channel) {
      finishLoad();
      return;
    }
    if (playerEl.querySelector(SEL.adProgress)) {
      // An ad plays in the player's video; the stream's own load comes after it.
      uncover();
      return;
    }
    liveCover.cover(playerEl, video);
    if (video.readyState < 2) return;
    if (!isLiveMedia(video)) {
      // A finished video on the channel page, nothing to rewind. Only this load is done: right after a
      // channel switch Kick loads the previous channel's recording once more before the new stream.
      // After an ad that interrupted the jump, the recording is where the jump went.
      if (live.adChannel === channel) live.doneChannel = channel;
      live.adChannel = null;
      finishLoad();
      return;
    }

    load.playingSince ??= Date.now();
    showControls(video);
    const slider = dom.queryFirst(playerEl, SEL.seekSlider);
    if (!slider) {
      if (Date.now() - load.playingSince < LIVE_SEEKBAR_WAIT_MS) {
        schedulePoll();
      } else {
        live.doneChannel = channel;
        finishLoad();
      }
      return;
    }
    live.doneChannel = channel;
    live.adChannel = null;
    load.sent = true;
    seekToStreamStart(slider);
    // Loading may have used up most of the time; the jump gets its own.
    liveCover.arm();
    schedulePoll();
  }

  function onMediaEvent(event) {
    const doc = event.currentTarget;
    if (root.NoSpoiler !== NS || NS.isContextInvalid()) {
      // A newer copy of this script took over, or the extension is gone.
      for (const type of LIVE_MEDIA_EVENTS) doc.removeEventListener(type, onMediaEvent, true);
      uncover();
      return;
    }
    const video = event.target;
    const playerEl = video.closest?.(SEL.channelPlayer);
    if (!playerEl || dom.queryFirst(playerEl, SEL.playerVideo) !== video) return;
    if (event.type === "volumechange") {
      liveCover.onVolumeChange(video);
      return;
    }
    const load = live.load;
    const jumping = load?.video === video && load.sent && !load.finished && liveChannel(currentUrl(doc)) === load.channel;
    // The jump loads the recording into the same element; that load is still this one.
    if (!jumping && event.type === "loadstart") {
      uncover();
      live.load = { video, playingSince: null, sent: false, channel: liveChannel(currentUrl(doc)), abandoned: false, finished: false };
    }
    if (live.load?.video === video) evaluateLive();
  }

  function onPageHide() {
    // Gives the volume back before the page can keep the silenced one.
    if (root.NoSpoiler === NS) uncover();
  }

  function updateLiveStart(ctx) {
    live.ctx = ctx;
    if (live.listening !== ctx.document) {
      NS.liveCover.clearStale(ctx.document);
      // Media events do not bubble; capturing on the document sees every <video>.
      for (const type of LIVE_MEDIA_EVENTS) ctx.document.addEventListener(type, onMediaEvent, true);
      ctx.document.defaultView?.addEventListener("pagehide", onPageHide);
      live.listening = ctx.document;
    }
    // Coming back to a channel later is a new visit.
    if (ctx.reason === "navigate" && live.doneChannel !== liveChannel(currentUrl(ctx.document))) {
      live.doneChannel = null;
      live.adChannel = null;
    }
    evaluateLive();
  }

  /* -------------------------------- hook ------------------------------- */

  NS.definePlatform("kick", {
    update(ctx) {
      const doc = ctx.document;
      const html = doc.documentElement;
      const opts = ctx.options;
      const isState = ctx.reason === "state";

      const page = pageType(ctx.url);
      if (html.getAttribute(PAGE) !== page) html.setAttribute(PAGE, page);

      if (ctx.active && opts.hideCardDurations) markDurations(doc);
      else if (isState) unmarkDurations(doc);

      if (ctx.active && (opts.hideCurrentTime || opts.hideDuration || opts.hideLiveUptime)) markPlayerTime(doc, page);
      else if (isState) unmarkPlayerTime(doc);

      // Seeking only makes sense on videos and clips.
      const seekable = page === "vod" || page === "clip";
      if (ctx.active && seekable && opts.skipButtons) ensureSkipButtons(doc, opts.skipButtonSteps);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "skip-bar");

      if (ctx.active && seekable && opts.overlayControls) ensureOverlay(doc, opts.overlaySteps);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "overlay");

      if (ctx.active && opts.hideVodChatReplay && page === "vod") enforceCollapsed(doc);
      else restoreChat(doc);

      if (ctx.active && opts.hideTooltips) dom.stashTitles(doc, SEL.tooltips);
      else if (isState) dom.restoreTitles(doc);

      updateLiveStart(ctx);
    },
  });

  // Exposed for tests.
  NS.kick = { SEL, pageType, markDurations, markPlayerTime, ensureSkipButtons, ensureOverlay, liveChannel, LIVE_COVER, LIVE_SEEKBAR_WAIT_MS, VOLUME_COOKIE };
})(globalThis);
