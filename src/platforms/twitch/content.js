/*
 * Twitch: the parts CSS cannot do.
 * - Page type (vod, clip, other) as data attribute on <html> for scoped rules.
 * - Marks durations on cards by their text, and keeps non-duration stats visible.
 * - Marks the time labels of the live player by their text.
 * - Moves title tooltips away and back.
 * - Inserts skip buttons and the centre overlay on videos and clips.
 * - Collapses the chat column with Twitch's own button.
 * - Starts live streams at the beginning, where Twitch allows rewinding.
 */
"use strict";

(function (root) {
  const NS = root.NoSpoiler;
  const { dom } = NS;

  const SEL = {
    // Cards of videos and clips (links around the thumbnail)
    mediaCardLinks: [
      'a[data-a-target="preview-card-image-link"][href*="/videos/"]',
      'a[data-a-target="preview-card-image-link"][href*="/clip/"]',
      'a[href*="/videos/"]',
      'a[href*="/clip/"]',
      'a[href*="clips.twitch.tv/"]',
    ],
    cardStats: [".tw-media-card-stat"],
    videoPlayer: ['[data-a-target="video-player"]'],
    mainVideo: '[data-a-target="video-player"]:not([data-a-player-type="frontpage"]) video',
    playerControls: ['[data-a-target="player-controls"]'],
    seekbar: ['[data-a-target="player-seekbar"]'],
    // Seek bar, its time labels and its hover preview (one selector, for closest()).
    seekbarParts: '[data-a-target^="player-seekbar"], .vod-seekbar-time-labels, [role="dialog"], [role="tooltip"]',
    seekbarSegment: ['[data-test-selector="seekbar-segment__segment"]'],
    playButton: ['[data-a-target="player-play-pause-button"]'],
    chatToggle: ['[data-a-target="right-column__toggle-collapse-btn"]'],
    chatExpanded: [".channel-root__right-column--expanded"],
    tooltips: [
      '[data-a-target="preview-card-title-link"][title]',
      '[data-a-target="preview-card-title-link"] [title]',
      '[data-test-selector="TitleAndChannel"] > h4[title]',
      'a[data-a-target="preview-card-image-link"][title]',
      '[data-a-target="stream-title"][title]',
      '[data-a-target="player-info-title"][title]',
    ],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
  const LIVE_TIME = "data-ns-live-time";
  const PAGE = "data-ns-page";

  /** vod, clip or other, from the URL. */
  function pageType(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return "other";
    }
    if (u.hostname === "clips.twitch.tv") return "clip";
    if (/^\/videos\/\d+/.test(u.pathname)) return "vod";
    if (/^\/[^/]+\/clip\/[^/]+/.test(u.pathname)) return "clip";
    return "other";
  }

  /* ------------------------------ durations ---------------------------- */

  function markDurations(doc) {
    for (const link of dom.queryAll(doc, SEL.mediaCardLinks)) {
      for (const stat of dom.queryAll(link, SEL.cardStats)) {
        const text = stat.textContent.trim();
        if (text && !dom.isDuration(text)) stat.setAttribute(KEEP, "");
        else stat.removeAttribute(KEEP);
      }
      for (const el of link.querySelectorAll("*")) {
        if (el.children.length === 0 && dom.isDuration(el.textContent)) {
          dom.badgeFor(el, link).setAttribute(DURATION, "");
        }
      }
    }
  }

  function unmarkDurations(doc) {
    dom.clearAttr(doc, KEEP);
    dom.clearAttr(doc, DURATION);
  }

  /* -------------------------- live player time ------------------------- */

  // "00:02:17" (time since the stream started) and "-4:56:23" (distance to the live edge, with rewind).
  const LIVE_TIME_RE = /^[-−]?\d{1,2}:\d{2}(?::\d{2})?$/;

  /**
   * The live player's time labels have no stable attribute, only hashed
   * classes, so they are found by their text inside the player controls.
   * The labelled time row of a video stays with hideCurrentTime and
   * hideDuration, also when a video plays on a channel page.
   */
  function markLiveTime(doc) {
    for (const controls of dom.queryAll(doc, SEL.playerControls)) {
      for (const el of controls.querySelectorAll("*")) {
        if (el.children.length > 0 || el.closest(SEL.seekbarParts)) continue;
        if (LIVE_TIME_RE.test(el.textContent.trim())) el.setAttribute(LIVE_TIME, "");
        else el.removeAttribute(LIVE_TIME);
      }
    }
  }

  /* --------------------------- seek controls --------------------------- */

  const videoOf = (container) => () => container.querySelector("video");

  /** Players of videos and clips, not the home page carousel or live streams. */
  function seekablePlayers(doc) {
    return dom.queryAll(doc, SEL.videoPlayer).filter((p) => p.getAttribute("data-a-player-type") !== "frontpage");
  }

  function ensureSkipButtons(doc, amounts) {
    for (const container of seekablePlayers(doc)) {
      const playBtn = dom.queryFirst(container, SEL.playButton);
      if (playBtn) NS.player.ensureSkipBar(doc, playBtn, videoOf(container), amounts);
    }
  }

  function ensureOverlay(doc, amounts) {
    for (const container of seekablePlayers(doc)) NS.player.ensureOverlay(doc, container, videoOf(container), amounts);
  }

  /* -------------------------------- chat ------------------------------- */

  const CHAT_RESTORE_KEY = "twitch.chatRestore";
  let restorePending = true;
  let restoreFlagWritten = false;

  const chatWanted = (ctx, page) =>
    ctx.active && (page === "vod" ? ctx.options.hideVodChatReplay : ctx.options.hideLiveChat);

  /**
   * Keeps the chat column collapsed with Twitch's own button while the option
   * is on (CSS hides the button, so it cannot be opened in between). Runs on
   * every tick, so a chat opened by Twitch is collapsed again right away.
   * Remembers in storage.local (any tab) that the extension collapsed it.
   */
  function enforceCollapsed(doc) {
    if (!dom.queryFirst(doc, SEL.chatExpanded)) return;
    const button = dom.queryFirst(doc, SEL.chatToggle);
    if (!button) return;
    button.click();
    if (!restoreFlagWritten) {
      NS.api.storage.local.set({ [CHAT_RESTORE_KEY]: true });
      restoreFlagWritten = true;
    }
  }

  /** Opens the chat again, but only if the extension collapsed it. Returns false until the button exists. */
  function restoreChat(doc) {
    if (!dom.queryFirst(doc, SEL.chatToggle)) return false;
    const storage = NS.api.storage.local;
    storage.get(CHAT_RESTORE_KEY).then((data) => {
      if (!data[CHAT_RESTORE_KEY]) return;
      if (!dom.queryFirst(doc, SEL.chatExpanded)) dom.queryFirst(doc, SEL.chatToggle)?.click();
      storage.remove(CHAT_RESTORE_KEY);
      restoreFlagWritten = false;
    });
    return true;
  }

  /* ------------------------ live from the start ------------------------ */

  /*
   * Twitch's rewind is out of reach of the <video> element: the media time
   * starts at 0 on every load, and seeking outside the few buffered seconds
   * makes the player jump back. What works is a click at the start of the
   * player's seek bar, so this sends one. The live player only has a seek bar
   * with rewind rights (Turbo or a channel sub, on channels that keep their
   * videos); without one there is nothing to do.
   *
   * Every media load of the main player on a channel page is looked at once.
   * The video is covered and silenced (core/live-cover.js) until the seek bar
   * shows the start of the stream and a frame from there is ready. Each visit
   * of a channel is handled once: the "Live" button, quality changes or
   * reloads afterwards are left alone.
   */
  const LIVE_COVER = NS.liveCover.ATTR;
  // Without rewind rights the seek bar never comes; this is how long a stream
  // that already plays stays covered waiting for it.
  const LIVE_SEEKBAR_WAIT_MS = 3000;
  // Seek bar layout and the played segment change without DOM mutations the runtime would see.
  const LIVE_POLL_MS = 250;
  // The played segment fills the bar at the live edge and is a sliver after the jump.
  const LIVE_START_MAX_FRACTION = 0.05;
  const LIVE_CLICK_INSET_PX = 2;
  // Page localStorage entry of Twitch's saved player volume; touched only if it was saved as 0 during the cover.
  const VOLUME_STORAGE_KEY = "volume";
  const LIVE_MEDIA_EVENTS = ["loadstart", "loadeddata", "canplay", "playing", "seeked", "volumechange"];
  // As a mouse click sends them; the leave events end the hover state, which would otherwise keep the seek preview open.
  const CLICK_EVENTS = ["pointerover", "mouseover", "pointermove", "mousemove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"];
  const LEAVE_EVENTS = ["pointerout", "pointerleave", "mouseout", "mouseleave"];
  // First path segments that are Twitch pages, not channels.
  const NOT_CHANNELS = new Set(["directory", "downloads", "drops", "friends", "inventory", "messages", "search", "settings", "subscriptions", "turbo", "wallet"]);

  const live = {
    ctx: null, // latest update context, read by the media event handler
    listening: null, // document with the media listeners
    load: null, // { video, playingSince, clicked, channel, freshFrame, abandoned, finished } of the current media load
    doneChannel: null, // channel handled last; forgotten when navigating to another page
    poll: null,
  };

  const liveCover = NS.liveCover.create({
    volumeKey: VOLUME_STORAGE_KEY,
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
    if (u.hostname === "clips.twitch.tv") return null;
    const m = /^\/(\w+)\/?$/.exec(u.pathname);
    const name = m ? m[1].toLowerCase() : null;
    return name && !NOT_CHANNELS.has(name) ? name : null;
  }

  function liveOptionOn(ctx) {
    return Boolean(ctx && ctx.active && ctx.options.liveFromStart);
  }

  function currentUrl(doc) {
    return doc.location ? doc.location.href : live.ctx?.url;
  }

  /** The seek bar of the player that can be clicked; the controls may exist twice, only one is laid out. */
  function findSeekbar(playerEl) {
    for (const bar of dom.queryAll(playerEl, SEL.seekbar)) {
      if (bar.getBoundingClientRect().width > 0) return bar;
    }
    return null;
  }

  /** Share of the bar before the current position, from the played segment's width; null if unknown. */
  function playedFraction(bar) {
    const segment = dom.queryFirst(bar, SEL.seekbarSegment);
    const m = segment && /^([\d.]+)%$/.exec(segment.style.width);
    return m ? Number(m[1]) / 100 : null;
  }

  function atStreamStart(playerEl) {
    const bar = findSeekbar(playerEl);
    const fraction = bar && playedFraction(bar);
    return fraction !== null && fraction <= LIVE_START_MAX_FRACTION;
  }

  /** Sends a mouse click to the start of the seek bar; Twitch reads the position from the event's coordinates. */
  function clickStreamStart(bar, playerEl) {
    const view = bar.ownerDocument.defaultView;
    const rect = bar.getBoundingClientRect();
    const rtl = view.getComputedStyle(bar).direction === "rtl";
    const init = {
      clientX: rtl ? rect.right - LIVE_CLICK_INSET_PX : rect.left + LIVE_CLICK_INSET_PX,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
      view,
      button: 0,
    };
    const send = (type, extra) => {
      const opts = { ...init, ...extra };
      const event = type.startsWith("pointer")
        ? new view.PointerEvent(type, { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true })
        : new view.MouseEvent(type, opts);
      bar.dispatchEvent(event);
    };
    for (const type of CLICK_EVENTS) send(type);
    for (const type of LEAVE_EVENTS) send(type, { relatedTarget: playerEl, bubbles: !type.endsWith("leave") });
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
      // Orphaned copy: a poll must not click on behalf of a script that is gone.
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
    const playerEl = video.isConnected ? video.closest(SEL.videoPlayer[0]) : null;
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
    // Twitch changes the URL before the next channel's media loads; until then
    // this media is still the previous channel's, maybe at its live edge, and
    // must not be judged by the new name. The attempt ends but a cover stays;
    // the next channel's loadstart starts its own load.
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
    if (load.clicked) {
      // Uncovered by leaving the page or switching the option off: nothing left to wait for.
      if (!liveCover.isCovered()) {
        finishLoad();
        return;
      }
      // Uncover only once the jump is visible and a frame of the new position can be shown.
      if (load.freshFrame && !video.seeking && video.readyState >= 2 && atStreamStart(playerEl)) finishLoad();
      else schedulePoll();
      return;
    }
    if (live.doneChannel === channel) {
      finishLoad();
      return;
    }
    liveCover.cover(playerEl, video);
    if (video.readyState < 2) return;

    load.playingSince ??= Date.now();
    const bar = findSeekbar(playerEl);
    if (!bar) {
      if (Date.now() - load.playingSince < LIVE_SEEKBAR_WAIT_MS) {
        schedulePoll();
      } else {
        live.doneChannel = channel;
        finishLoad();
      }
      return;
    }
    live.doneChannel = channel;
    load.clicked = true;
    clickStreamStart(bar, playerEl);
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
    if (!video.matches?.(SEL.mainVideo)) return;
    if (event.type === "volumechange") {
      liveCover.onVolumeChange(video);
      return;
    }
    const load = live.load;
    if (load?.video === video && load.clicked && !load.finished && liveChannel(currentUrl(doc)) === load.channel) {
      // The jump reloads or seeks the media; what plays after that is the new position.
      if (event.type === "loadstart" || event.type === "seeked") load.freshFrame = true;
    } else if (event.type === "loadstart") {
      uncover();
      live.load = { video, playingSince: null, clicked: false, channel: liveChannel(currentUrl(doc)), freshFrame: false, abandoned: false, finished: false };
    }
    if (live.load?.video === video) evaluateLive();
  }

  function onPageHide() {
    // Gives the volume back before Twitch can keep the silenced one for the next visit.
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
    if (ctx.reason === "navigate" && live.doneChannel !== liveChannel(currentUrl(ctx.document))) live.doneChannel = null;
    evaluateLive();
  }

  /* -------------------------------- hook ------------------------------- */

  NS.definePlatform("twitch", {
    update(ctx) {
      const doc = ctx.document;
      const html = doc.documentElement;
      const opts = ctx.options;
      const isState = ctx.reason === "state";

      const page = pageType(ctx.url);
      if (html.getAttribute(PAGE) !== page) html.setAttribute(PAGE, page);

      if (ctx.active && opts.hideCardDurations) markDurations(doc);
      else if (isState) unmarkDurations(doc);

      // Videos and clips have their own labelled time row (hideCurrentTime, hideDuration).
      if (ctx.active && opts.hideLivePlayerTime && page === "other") markLiveTime(doc);
      else if (isState || ctx.reason === "navigate") dom.clearAttr(doc, LIVE_TIME);

      // Seeking only makes sense on videos and clips.
      const seekable = page === "vod" || page === "clip";
      if (ctx.active && seekable && opts.skipButtons) ensureSkipButtons(doc, opts.skipButtonSteps);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "skip-bar");

      if (ctx.active && seekable && opts.overlayControls) ensureOverlay(doc, opts.overlaySteps);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "overlay");

      if (chatWanted(ctx, page)) {
        enforceCollapsed(doc);
        restorePending = true;
      } else if (restorePending && restoreChat(doc)) {
        restorePending = false;
      }

      if (ctx.active && opts.hideTooltips) dom.stashTitles(doc, SEL.tooltips);
      else if (isState) dom.restoreTitles(doc);

      updateLiveStart(ctx);
    },
  });

  // Exposed for tests.
  NS.twitch = { SEL, pageType, markDurations, markLiveTime, ensureSkipButtons, ensureOverlay, CHAT_RESTORE_KEY, liveChannel, LIVE_COVER, LIVE_SEEKBAR_WAIT_MS, VOLUME_STORAGE_KEY };
})(globalThis);
