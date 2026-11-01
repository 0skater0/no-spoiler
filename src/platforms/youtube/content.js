/*
 * YouTube: the parts CSS cannot do.
 * - Marks thumbnail badges that are not durations, so CSS can show them again.
 * - Inserts skip buttons next to the play button (once per player).
 * - Switches autoplay off and back on.
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
    autoplayToggle: [".ytp-autonav-toggle-button[aria-checked]", "[data-tooltip-target-id='ytp-autonav-toggle-button'] [aria-checked]"],
  };

  const KEEP = "data-ns-keep";
  const DURATION = "data-ns-duration";
  const AUTOPLAY_RESTORE_KEY = "youtube.autoplayRestore";
  const SKIP_STEPS = [-600, -300, 300, 600];

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

  /* ---------------------------- skip buttons --------------------------- */

  function formatStep(seconds) {
    const min = Math.abs(seconds) / 60;
    return `${seconds < 0 ? "−" : "+"}${min}`;
  }

  function createSkipControls(doc, player) {
    const box = doc.createElement("div");
    box.className = "ns-skip-controls";
    for (const step of SKIP_STEPS) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.textContent = formatStep(step);
      const label = `${step < 0 ? "Back" : "Forward"} ${Math.abs(step) / 60} minutes`;
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        skip(player, step);
      });
      box.appendChild(btn);
    }
    return box;
  }

  function skip(player, seconds) {
    const video = player?.querySelector("video");
    if (!video) return;
    const max = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(max, Math.max(0, video.currentTime + seconds));
  }

  /** Idempotent: inserts at most one set of buttons per player bar. */
  function ensureSkipButtons(doc) {
    for (const playBtn of dom.queryAll(doc, SEL.playButton)) {
      const bar = playBtn.parentElement;
      if (!bar || bar.querySelector(".ns-skip-controls")) continue;
      const player = playBtn.closest(".html5-video-player");
      bar.insertBefore(createSkipControls(doc, player), playBtn.nextSibling);
    }
  }

  function removeSkipButtons(doc) {
    for (const el of doc.querySelectorAll(".ns-skip-controls")) el.remove();
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

      if (ctx.active && opts.skipButtons) ensureSkipButtons(doc);
      else if (ctx.reason === "state") removeSkipButtons(doc);

      if (ctx.reason === "state" || ctx.reason === "navigate") autoplayPending = true;
      if (autoplayPending && reconcileAutoplay(ctx)) autoplayPending = false;
    },
  });

  // Exposed for tests.
  NS.youtube = { SEL, markBadges, ensureSkipButtons, removeSkipButtons, skip, AUTOPLAY_RESTORE_KEY };
})(globalThis);
