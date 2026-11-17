/*
 * Covers and silences a player while a platform script moves a live stream
 * away from its live edge, with a safety timeout so the player cannot stay
 * dark. The platform stylesheet hides the video of a player carrying ATTR.
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});

  const ATTR = "data-ns-live-cover";
  // Gives the player back if loading or the jump stalls. `arm()` restarts the
  // time once the jump is issued, within MAX_MS after the cover went on.
  const TIMEOUT_MS = 8000;
  const MAX_MS = 15000;

  function pageStorage(doc) {
    try {
      return doc.defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  }

  function readStored(doc, key) {
    try {
      return pageStorage(doc)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Silencing sets the volume to 0 and leaves `muted` alone, so whatever the
   * user does with mute during the cover stands; only the volume is given
   * back. The volume to give back is kept in ATTR, so a newer copy of the
   * script can undo the cover of an orphaned one.
   *
   * @param {object} opts
   * @param {(playerEl: Element) => void} opts.onTimeout  runs after the cover was given back by the timeout
   * @param {string|null} [opts.volumeKey]  localStorage entry in which the page saves its player volume;
   *   a 0 saved there during the cover is put back to the previous value, or removed if there was none,
   *   so the silencing does not outlive it
   */
  function create({ onTimeout, volumeKey = null }) {
    const s = { player: null, video: null, volume: 1, stored: null, start: 0, timer: null };

    function cover(playerEl, video) {
      if (s.player === playerEl) return;
      uncover();
      s.player = playerEl;
      s.video = video;
      s.volume = video.volume;
      s.stored = volumeKey ? readStored(playerEl.ownerDocument, volumeKey) : null;
      playerEl.setAttribute(ATTR, String(s.volume));
      video.volume = 0;
      s.start = Date.now();
      arm();
    }

    /** (Re)starts the safety timeout, never beyond MAX_MS after the cover went on. */
    function arm() {
      if (!s.player) return;
      if (s.timer !== null) clearTimeout(s.timer);
      const playerEl = s.player;
      const left = s.start + MAX_MS - Date.now();
      s.timer = setTimeout(() => {
        s.timer = null;
        uncover();
        onTimeout(playerEl);
      }, Math.max(0, Math.min(TIMEOUT_MS, left)));
    }

    /** The player applies its saved volume while it loads; that becomes the volume to give back. */
    function onVolumeChange(video) {
      if (s.video !== video || video.volume === 0) return;
      s.volume = video.volume;
      s.player.setAttribute(ATTR, String(s.volume));
      video.volume = 0;
    }

    /** Takes back a 0 the page saved during the cover; an entry that did not exist before is removed again. */
    function restoreStored(doc) {
      if (!volumeKey) return;
      const storage = pageStorage(doc);
      try {
        const now = storage?.getItem(volumeKey) ?? null;
        if (now === null || Number(now) !== 0) return;
        if (s.stored === null) storage.removeItem(volumeKey);
        else if (Number(s.stored) > 0) storage.setItem(volumeKey, s.stored);
      } catch {
        /* storage blocked: nothing was saved there either */
      }
    }

    function uncover() {
      if (s.timer !== null) clearTimeout(s.timer);
      s.timer = null;
      const doc = s.player?.ownerDocument;
      s.player?.removeAttribute(ATTR);
      s.player = null;
      // Not 0 any more: someone else (a newer copy of this script) gave it back already.
      if (s.video?.volume === 0) s.video.volume = s.volume;
      s.video = null;
      if (doc) restoreStored(doc);
      s.stored = null;
    }

    return { cover, arm, onVolumeChange, uncover, isCovered: () => s.player !== null };
  }

  /** Undoes covers left behind by an orphaned copy of a script (extension updated or reloaded). */
  function clearStale(doc) {
    for (const playerEl of doc.querySelectorAll(`[${ATTR}]`)) {
      const volume = Number(playerEl.getAttribute(ATTR));
      const video = playerEl.querySelector("video");
      if (video && video.volume === 0 && volume > 0 && volume <= 1) video.volume = volume;
      playerEl.removeAttribute(ATTR);
    }
  }

  NS.liveCover = { ATTR, TIMEOUT_MS, MAX_MS, create, clearStale };
})(globalThis);
