/*
 * Twitch: the parts CSS cannot do.
 * - Page type (vod, clip, other) as data attribute on <html> for scoped rules.
 * - Marks durations on cards by their text, and keeps non-duration stats visible.
 * - Moves title tooltips away and back.
 * - Inserts skip buttons and the centre overlay on videos and clips.
 * - Collapses the chat column with Twitch's own button.
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
    playButton: ['[data-a-target="player-play-pause-button"]'],
    chatToggle: ['[data-a-target="right-column__toggle-collapse-btn"]'],
    chatExpanded: [".channel-root__right-column--expanded"],
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
    },
  });

  // Exposed for tests.
  NS.twitch = { SEL, pageType, markDurations, ensureSkipButtons, ensureOverlay, CHAT_RESTORE_KEY };
})(globalThis);
