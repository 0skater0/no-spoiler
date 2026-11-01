/*
 * Seek controls shared by all platforms:
 * - a skip bar next to the player's play button,
 * - an overlay in the middle of the video, visible while hovering.
 * Platforms decide where to insert them; this file builds them and seeks.
 * Inserted elements carry the attribute data-ns-player so they can be found
 * and removed again, also by a copy of the script from an older version.
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});
  const player = (NS.player = {});

  player.SKIP_BAR_STEPS = [-600, -300, 300, 600];
  player.OVERLAY_STEPS = [-600, -60, -10, 10, 60, 600];

  /** "−10m", "+30s", "+1h". */
  player.formatStep = function (seconds) {
    const sign = seconds < 0 ? "−" : "+";
    const abs = Math.abs(seconds);
    if (abs >= 3600 && abs % 3600 === 0) return `${sign}${abs / 3600}h`;
    if (abs >= 60 && abs % 60 === 0) return `${sign}${abs / 60}m`;
    return `${sign}${abs}s`;
  };

  player.describeStep = function (seconds) {
    const abs = Math.abs(seconds);
    const amount = abs >= 60 && abs % 60 === 0 ? `${abs / 60} minute${abs === 60 ? "" : "s"}` : `${abs} seconds`;
    return `${seconds < 0 ? "Back" : "Forward"} ${amount}`;
  };

  /** Seeks within [0, duration]. Returns false when there is no usable video. */
  player.seekBy = function (video, seconds) {
    if (!video) return false;
    const max = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(max, Math.max(0, video.currentTime + seconds));
    return true;
  };

  player.togglePlay = function (video) {
    if (!video) return;
    if (video.paused) video.play?.()?.catch?.(() => {});
    else video.pause();
  };

  function button(doc, label, text, onClick, extraClass) {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = `ns-player-button${extraClass ? ` ${extraClass}` : ""}`;
    btn.textContent = text;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    // The players toggle play/pause or open menus on clicks that bubble up.
    for (const type of ["click", "dblclick", "mousedown", "pointerdown"]) {
      btn.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === "click") onClick();
      });
    }
    return btn;
  }

  /** Row of skip buttons, e.g. for the control bar. */
  player.createSkipBar = function (doc, getVideo, steps = player.SKIP_BAR_STEPS) {
    const bar = doc.createElement("div");
    bar.className = "ns-skip-controls";
    bar.setAttribute("data-ns-player", "skip-bar");
    for (const s of steps) {
      bar.appendChild(button(doc, player.describeStep(s), player.formatStep(s), () => player.seekBy(getVideo(), s)));
    }
    return bar;
  };

  /** Centre overlay: back steps, play/pause, forward steps. */
  player.createOverlay = function (doc, getVideo, steps = player.OVERLAY_STEPS) {
    const overlay = doc.createElement("div");
    overlay.className = "ns-overlay";
    overlay.setAttribute("data-ns-player", "overlay");
    const back = steps.filter((s) => s < 0).sort((a, b) => a - b);
    const fwd = steps.filter((s) => s > 0).sort((a, b) => a - b);
    for (const s of back) overlay.appendChild(button(doc, player.describeStep(s), player.formatStep(s), () => player.seekBy(getVideo(), s)));
    const play = button(doc, "Play or pause", "⏯", () => player.togglePlay(getVideo()), "ns-player-button--play");
    overlay.appendChild(play);
    for (const s of fwd) overlay.appendChild(button(doc, player.describeStep(s), player.formatStep(s), () => player.seekBy(getVideo(), s)));
    return overlay;
  };

  /**
   * Inserts the skip bar after `playButton` (or the wrapper around it), at
   * most once per control bar.
   */
  player.ensureSkipBar = function (doc, playButton, getVideo) {
    let anchor = playButton;
    while (anchor.parentElement && anchor.parentElement.children.length === 1) anchor = anchor.parentElement;
    const parent = anchor.parentElement;
    if (!parent || parent.querySelector(':scope > [data-ns-player="skip-bar"]')) return false;
    parent.insertBefore(player.createSkipBar(doc, getVideo), anchor.nextSibling);
    return true;
  };

  /** Appends the overlay to the player container, at most once. */
  player.ensureOverlay = function (doc, container, getVideo) {
    if (container.querySelector(':scope > [data-ns-player="overlay"]')) return false;
    container.appendChild(player.createOverlay(doc, getVideo));
    return true;
  };

  player.remove = function (doc, kind) {
    for (const el of doc.querySelectorAll(`[data-ns-player="${kind}"]`)) el.remove();
  };
})(globalThis);
