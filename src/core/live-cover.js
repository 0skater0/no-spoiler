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
  // How long after the cover a page may still save the silenced 0 (Kick saves while a media load starts).
  const STORE_RECHECK_MS = 1500;
  // A cover within this time after the last one is the same visit (Kick loads the next stream about 7 s
  // after a channel switch); a 0 saved in between is still the earlier cover's.
  const STORE_CARRY_MS = 20000;
  // A volume change this soon after an input on the player is the user's.
  const USER_INPUT_MS = 1000;
  const USER_INPUT_EVENTS = ["pointerdown", "pointermove", "pointerup", "keydown", "wheel"];

  /** The page's localStorage entry `key` as a volume store. */
  function localStore(key) {
    const storage = (doc) => doc.defaultView?.localStorage ?? null;
    return {
      read: (doc) => storage(doc)?.getItem(key) ?? null,
      write: (doc, value) => storage(doc)?.setItem(key, value),
      remove: (doc) => storage(doc)?.removeItem(key),
    };
  }

  /**
   * A first-party cookie of the page as a volume store. Assumes a host-only cookie, as Kick sets its
   * `volume` cookie (measured: host-only on kick.com, path /): it is written back without a domain
   * attribute, so a cookie the page set for a parent domain would be shadowed, not replaced.
   */
  function cookieStore(name, { path = "/", maxAgeS = 365 * 24 * 3600 } = {}) {
    const attrs = `; path=${path}; samesite=lax`;
    return {
      read(doc) {
        const entry = doc.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
        return entry === undefined ? null : decodeURIComponent(entry.slice(name.length + 1));
      },
      write: (doc, value) => (doc.cookie = `${name}=${encodeURIComponent(value)}${attrs}; max-age=${maxAgeS}`),
      remove: (doc) => (doc.cookie = `${name}=${attrs}; max-age=0`),
    };
  }

  function readStored(store, doc) {
    try {
      return store.read(doc);
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
   * @param {{read: Function, write: Function, remove: Function}|null} [opts.volumeStore]  the same for a page
   *   that saves its volume elsewhere, see localStore() and cookieStore()
   * @param {boolean} [opts.recheckStore]  for a page that may save the 0 only after the cover is gone, and
   *   may set its player to 0 on its own: the store is checked once more STORE_RECHECK_MS later, and a
   *   cover following within STORE_CARRY_MS keeps the volumes to give back from the one before if the
   *   store or the player holds a 0 by then. Neither the page's own 0 nor the user's carries a mark, so
   *   a volume change within USER_INPUT_MS after a pointer input on the player, or a key press on it or
   *   on the page body, counts as the user's: a 0 drops the carried volumes, so a deliberate silence
   *   stands, and any other volume becomes the one to give back. Changes by other means (a key press in
   *   a text field, a browser control) are not seen as the user's; their 0 can still be taken back
   *   within STORE_CARRY_MS. The page's own 0 is assumed not to follow an input on the player that soon.
   */
  function create({ onTimeout, volumeKey = null, volumeStore = volumeKey ? localStore(volumeKey) : null, recheckStore = false }) {
    const s = { player: null, video: null, volume: 1, stored: null, start: 0, timer: null, recheck: null, last: null, inputAt: -Infinity };
    const watchedDocs = new WeakSet();

    function cover(playerEl, video) {
      if (s.player === playerEl) return;
      uncover();
      cancelRecheck();
      const before = s.last && Date.now() - s.last.at < STORE_CARRY_MS ? s.last : null;
      s.last = null;
      s.player = playerEl;
      s.video = video;
      s.volume = video.volume;
      s.stored = volumeStore ? readStored(volumeStore, playerEl.ownerDocument) : null;
      // A 0 set or saved late for the cover before is not the volume to give back.
      if (before && s.volume === 0 && before.volume > 0) s.volume = before.volume;
      if (before && s.stored !== null && Number(s.stored) === 0) s.stored = before.stored;
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

    /**
     * During the cover the player applies its saved volume while it loads; that becomes the volume to
     * give back. After the cover a change by the user replaces the carried volumes, see recheckStore.
     */
    function onVolumeChange(video) {
      if (s.video !== video) {
        if (!s.player && s.last?.video === video && Date.now() - s.inputAt <= USER_INPUT_MS) {
          if (video.volume === 0) {
            s.last = null;
          } else {
            s.last.volume = video.volume;
            // The page saves it with its next media load; until then a recheck or carry must not put the old one back.
            if (volumeStore) s.last.stored = String(video.volume);
          }
        }
        return;
      }
      if (video.volume === 0) return;
      s.volume = video.volume;
      s.player.setAttribute(ATTR, String(s.volume));
      video.volume = 0;
    }

    /** Notes when the user works the player of the last cover; this script's own events come only while covered. */
    function onInput(event) {
      if (s.player || !s.last) return;
      if (event.type === "pointermove" && !event.buttons) return;
      const target = event.target;
      const doc = s.last.player.ownerDocument;
      const onPlayer = s.last.player.contains(target);
      const onPage = event.type === "keydown" && (target === doc.body || target === doc.documentElement);
      if (onPlayer || onPage) s.inputAt = Date.now();
    }

    function watchInput(doc) {
      if (watchedDocs.has(doc)) return;
      watchedDocs.add(doc);
      for (const type of USER_INPUT_EVENTS) doc.addEventListener(type, onInput, true);
    }

    /** Takes back a 0 the page saved during the cover; an entry that did not exist before is removed again. */
    function restoreStored(doc, stored) {
      if (!volumeStore) return;
      try {
        const now = volumeStore.read(doc);
        if (now === null || Number(now) !== 0) return;
        if (stored === null) volumeStore.remove(doc);
        else if (Number(stored) > 0) volumeStore.write(doc, stored);
      } catch {
        /* storage blocked: nothing was saved there either */
      }
    }

    function cancelRecheck() {
      if (s.recheck !== null) clearTimeout(s.recheck);
      s.recheck = null;
    }

    /** A 0 saved after the cover while the player is not at 0 is still the cover's; a 0 the user set stays. */
    function scheduleRecheck(doc, playerEl, video, stored) {
      cancelRecheck();
      watchInput(doc);
      s.inputAt = -Infinity;
      s.last = { player: playerEl, video, volume: video ? video.volume : s.volume, stored, at: Date.now() };
      s.recheck = setTimeout(() => {
        s.recheck = null;
        // The user may have set a new volume since; s.last then holds it.
        if (video && video.volume > 0) restoreStored(doc, s.last ? s.last.stored : stored);
      }, STORE_RECHECK_MS);
    }

    function uncover() {
      if (s.timer !== null) clearTimeout(s.timer);
      s.timer = null;
      const playerEl = s.player;
      const doc = playerEl?.ownerDocument;
      const video = s.video;
      playerEl?.removeAttribute(ATTR);
      s.player = null;
      // Not 0 any more: someone else (a newer copy of this script) gave it back already.
      if (video?.volume === 0) video.volume = s.volume;
      s.video = null;
      if (doc) {
        restoreStored(doc, s.stored);
        if (recheckStore && volumeStore) scheduleRecheck(doc, playerEl, video, s.stored);
      }
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

  NS.liveCover = { ATTR, TIMEOUT_MS, MAX_MS, STORE_RECHECK_MS, create, clearStale, localStore, cookieStore };
})(globalThis);
