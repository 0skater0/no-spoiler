/*
 * YouTube: the parts CSS cannot do.
 * - Marks thumbnail badges that are not durations, so CSS can show them again.
 * - Inserts skip buttons and the centre overlay (core/player-controls.js).
 * - Switches autoplay off and back on.
 * - Replaces the tab title and removes title tooltips.
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
    player: ["#movie_player", ".html5-video-player"],
    tooltips: [
      "#video-title[title]",
      "#video-title-link[title]",
      ".yt-lockup-metadata-view-model__title[title]",
      "ytd-watch-metadata #title [title]",
    ],
    autoplayToggle: [".ytp-autonav-toggle-button[aria-checked]", "[data-tooltip-target-id='ytp-autonav-toggle-button'] [aria-checked]"],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
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

  /* -------------------------------- hook ------------------------------- */

  NS.definePlatform("youtube", {
    navigationEvents: ["yt-navigate-finish"],

    update(ctx) {
      const doc = ctx.document;
      const opts = ctx.options;

      if (ctx.active && opts.hideThumbnailDurations) markBadges(doc);
      else if (ctx.reason === "state") unmarkBadges(doc);

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
    },
  });

  // Exposed for tests.
  NS.youtube = { SEL, markBadges, ensureSkipButtons, ensureOverlay, AUTOPLAY_RESTORE_KEY, TAB_TITLE };
})(globalThis);
