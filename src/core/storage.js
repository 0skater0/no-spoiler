/*
 * Settings storage and migration from the MV2 version (0.9.x).
 *
 * Layout (schema 2), flat keys so concurrent writers never overwrite each other:
 *   storage.local  ns.active                  master switch
 *   storage.sync   ns.schema = 2
 *                  <platform>.enabled         platform switch
 *                  <platform>.<option>        option value
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});

  /**
   * 0.9.x stored "show" flags in storage.sync; an absent key meant false,
   * i.e. the element was hidden. The new options use "hide" semantics.
   */
  NS.LEGACY_SYNC_MAP = Object.freeze([
    { from: "showVideoTime", to: "youtube.hideVideoTime", invert: true },
    { from: "showProgressBar", to: "youtube.hideProgressBar", invert: true },
    { from: "showComments", to: "youtube.hideComments", invert: true },
    { from: "showDescription", to: "youtube.hideDescription", invert: true },
    { from: "showRecommendations", to: "youtube.hideRecommendations", invert: true },
    { from: "showChat", to: "youtube.hideChat", invert: true },
    { from: "showEndcard", to: "youtube.hideEndcards", invert: true },
    { from: "enableAutoplay", to: "youtube.disableAutoplay", invert: true },
    { from: "enableSkipButtons", to: "youtube.skipButtons", invert: false },
  ]);
  NS.LEGACY_SYNC_OBSOLETE = Object.freeze(["originalAutoplay", "noSpoilerHotkey"]);
  NS.LEGACY_LOCAL_ACTIVE = "YouTubeNoSpoilersActive";

  /** Major version below 1 means the MV2 add-on. */
  NS.isLegacyVersion = function (version) {
    if (typeof version !== "string") return false;
    const major = Number.parseInt(version.split(".")[0], 10);
    return Number.isFinite(major) && major < 1;
  };

  /**
   * Computes the storage changes needed to reach the current schema.
   * Pure function, no API access.
   *
   * @param {object} sync   full storage.sync contents
   * @param {object} local  full storage.local contents
   * @param {object} opts   { fromLegacy: boolean } true when updating from 0.9.x
   * @returns {{syncSet: object, syncRemove: string[], localSet: object, localRemove: string[]} | null}
   *          null when nothing has to change
   */
  NS.planMigration = function (sync, local, opts = {}) {
    if (sync[NS.KEYS.schema] === NS.SCHEMA_VERSION) return null;

    const syncSet = { [NS.KEYS.schema]: NS.SCHEMA_VERSION };
    const syncRemove = [];
    const localSet = {};
    const localRemove = [];

    const hasLegacyData =
      NS.LEGACY_SYNC_MAP.some((m) => m.from in sync) ||
      NS.LEGACY_SYNC_OBSOLETE.some((k) => k in sync) ||
      NS.LEGACY_LOCAL_ACTIVE in local;

    if (opts.fromLegacy || hasLegacyData) {
      for (const m of NS.LEGACY_SYNC_MAP) {
        // Absent "show" keys meant "hide". That equals the new defaults,
        // so only keys the user actually stored are carried over.
        if (typeof sync[m.from] === "boolean" && !(m.to in sync)) {
          syncSet[m.to] = m.invert ? !sync[m.from] : sync[m.from];
        }
        if (m.from in sync) syncRemove.push(m.from);
      }
      for (const k of NS.LEGACY_SYNC_OBSOLETE) {
        if (k in sync) syncRemove.push(k);
      }
      if (!(NS.KEYS.active in local)) {
        // 0.9.x was inactive until the user switched it on.
        localSet[NS.KEYS.active] = local[NS.LEGACY_LOCAL_ACTIVE] === true;
      }
      if (NS.LEGACY_LOCAL_ACTIVE in local) localRemove.push(NS.LEGACY_LOCAL_ACTIVE);
    } else if (!(NS.KEYS.active in local)) {
      localSet[NS.KEYS.active] = true; // fresh install: protection on
    }

    return { syncSet, syncRemove, localSet, localRemove };
  };

  /** Applies the migration plan. New keys are written before old keys are removed. */
  NS.runMigration = async function (opts = {}) {
    const api = NS.api;
    const [sync, local] = await Promise.all([api.storage.sync.get(null), api.storage.local.get(null)]);
    const plan = NS.planMigration(sync, local, opts);
    if (!plan) return null;
    if (Object.keys(plan.localSet).length) await api.storage.local.set(plan.localSet);
    await api.storage.sync.set(plan.syncSet);
    if (plan.syncRemove.length) await api.storage.sync.remove(plan.syncRemove);
    if (plan.localRemove.length) await api.storage.local.remove(plan.localRemove);
    return plan;
  };

  NS.readState = async function () {
    const api = NS.api;
    const [sync, local] = await Promise.all([
      api.storage.sync.get(null),
      api.storage.local.get(NS.KEYS.active),
    ]);
    return NS.stateFromStorage(sync, local);
  };

  /** True when a storage.onChanged event touches settings. */
  NS.isSettingsChange = function (changes, areaName) {
    if (areaName === "local") return NS.KEYS.active in changes;
    if (areaName === "sync") {
      return Object.keys(changes).some((k) => NS.platforms.some((p) => k.startsWith(`${p.id}.`)));
    }
    return false;
  };

  NS.setActive = (value) => NS.api.storage.local.set({ [NS.KEYS.active]: Boolean(value) });
  NS.setPlatformEnabled = (platformId, value) =>
    NS.api.storage.sync.set({ [NS.enabledKey(platformId)]: Boolean(value) });
  NS.setOption = (platformId, optionKey, value) =>
    NS.api.storage.sync.set({ [NS.optionKey(platformId, optionKey)]: Array.isArray(value) ? [...value] : Boolean(value) });

  /** Removes all stored values of a platform so defaults apply again. */
  NS.resetPlatform = function (platformId) {
    const p = NS.getPlatform(platformId);
    const keys = [NS.enabledKey(platformId), ...p.options.map((o) => NS.optionKey(platformId, o.key))];
    return NS.api.storage.sync.remove(keys);
  };
})(globalThis);
