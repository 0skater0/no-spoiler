/*
 * Twitch: the parts CSS cannot do.
 * - Page type (vod, clip, other) as data attribute on <html> for scoped rules.
 * - Marks durations on cards by their text, and keeps non-duration stats visible.
 * - Marks the seek bar container for the progress cover.
 * - Moves title tooltips away and back.
 * - Inserts skip buttons and the centre overlay on videos and clips.
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
    seekbar: [
      '[data-a-target="player-seekbar"]',
      '[data-test-selector="seekbar-interaction-area__interaction-area"]',
      '[data-a-target="video-player"] [role="slider"]',
      ".seekbar-interaction-area",
    ],
    videoPlayer: ['[data-a-target="video-player"]'],
    playButton: ['[data-a-target="player-play-pause-button"]'],
    tooltips: [
      '[data-a-target="preview-card-title-link"][title]',
      '[data-a-target="preview-card-title-link"] [title]',
      'a[data-a-target="preview-card-image-link"][title]',
      '[data-a-target="stream-title"][title]',
      '[data-a-target="player-info-title"][title]',
    ],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
  const SEEKBAR = "data-ns-seekbar";
  const STATIC = "data-ns-static";
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

  /* ------------------------------- seek bar ---------------------------- */

  function markSeekbars(doc, win) {
    for (const found of dom.queryAll(doc, SEL.seekbar)) {
      // Pseudo-elements do not render on <input>; use its parent instead.
      const el = found.tagName === "INPUT" ? found.parentElement : found;
      if (!el || el.hasAttribute(SEEKBAR)) continue;
      el.setAttribute(SEEKBAR, "");
      const style = win?.getComputedStyle?.(el);
      if (style && style.position === "static") el.setAttribute(STATIC, "");
    }
  }

  function unmarkSeekbars(doc) {
    dom.clearAttr(doc, SEEKBAR);
    dom.clearAttr(doc, STATIC);
  }

  /* --------------------------- seek controls --------------------------- */

  const videoOf = (container) => () => container.querySelector("video");

  /** Players of videos and clips, not the home page carousel or live streams. */
  function seekablePlayers(doc) {
    return dom.queryAll(doc, SEL.videoPlayer).filter((p) => p.getAttribute("data-a-player-type") !== "frontpage");
  }

  function ensureSkipButtons(doc) {
    for (const container of seekablePlayers(doc)) {
      const playBtn = dom.queryFirst(container, SEL.playButton);
      if (playBtn) NS.player.ensureSkipBar(doc, playBtn, videoOf(container));
    }
  }

  function ensureOverlay(doc) {
    for (const container of seekablePlayers(doc)) NS.player.ensureOverlay(doc, container, videoOf(container));
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

      if (ctx.active && opts.hideSeekbarProgress) markSeekbars(doc, doc.defaultView);
      else if (isState) unmarkSeekbars(doc);

      // Seeking only makes sense on videos and clips.
      const seekable = page === "vod" || page === "clip";
      if (ctx.active && seekable && opts.skipButtons) ensureSkipButtons(doc);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "skip-bar");

      if (ctx.active && seekable && opts.overlayControls) ensureOverlay(doc);
      else if (isState || ctx.reason === "navigate") NS.player.remove(doc, "overlay");

      if (ctx.active && opts.hideTooltips) dom.stashTitles(doc, SEL.tooltips);
      else if (isState) dom.restoreTitles(doc);
    },
  });

  // Exposed for tests.
  NS.twitch = { SEL, pageType, markDurations, markSeekbars, ensureSkipButtons, ensureOverlay };
})(globalThis);
