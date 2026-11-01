import { beforeEach, describe, expect, it } from "vitest";
import { loadExtension } from "./helpers/env.js";

let NS, api;
beforeEach(async () => {
  ({ NS, api } = await loadExtension());
});

describe("planMigration", () => {
  it("does nothing when the schema is current", () => {
    expect(NS.planMigration({ "ns.schema": 2 }, {})).toBeNull();
  });

  it("fresh install: protection on, schema written", () => {
    expect(NS.planMigration({}, {})).toEqual({
      syncSet: { "ns.schema": 2 },
      syncRemove: [],
      localSet: { "ns.active": true },
      localRemove: [],
    });
  });

  it("update from 0.9.x without stored data: off like before", () => {
    const plan = NS.planMigration({}, {}, { fromLegacy: true });
    expect(plan.localSet).toEqual({ "ns.active": false });
  });

  it("inverts show flags and carries over the active state", () => {
    const plan = NS.planMigration(
      {
        showVideoTime: true,
        showProgressBar: false,
        showComments: true,
        showEndcard: false,
        enableAutoplay: true,
        enableSkipButtons: true,
        originalAutoplay: true,
        noSpoilerHotkey: "Ctrl+Alt+U",
      },
      { YouTubeNoSpoilersActive: true },
    );
    expect(plan.syncSet).toEqual({
      "ns.schema": 2,
      "youtube.hideVideoTime": false,
      "youtube.hideProgressBar": true,
      "youtube.hideComments": false,
      "youtube.hideEndcards": true,
      "youtube.disableAutoplay": false,
      "youtube.skipButtons": true,
    });
    expect(plan.syncRemove.sort()).toEqual(
      [
        "showVideoTime",
        "showProgressBar",
        "showComments",
        "showEndcard",
        "enableAutoplay",
        "enableSkipButtons",
        "originalAutoplay",
        "noSpoilerHotkey",
      ].sort(),
    );
    expect(plan.localSet).toEqual({ "ns.active": true });
    expect(plan.localRemove).toEqual(["YouTubeNoSpoilersActive"]);
  });

  it("absent show flags keep the defaults (hidden)", () => {
    const plan = NS.planMigration({ showComments: true }, {}, { fromLegacy: true });
    expect(plan.syncSet).toEqual({ "ns.schema": 2, "youtube.hideComments": false });
    const state = NS.stateFromStorage(plan.syncSet, plan.localSet);
    expect(state.platforms.youtube.options.hideVideoTime).toBe(true);
    expect(state.platforms.youtube.options.hideComments).toBe(false);
    expect(state.platforms.youtube.options.skipButtons).toBe(false);
    expect(state.active).toBe(false);
  });

  it("detects legacy data even without the update flag", () => {
    const plan = NS.planMigration({}, { YouTubeNoSpoilersActive: false });
    expect(plan.localSet).toEqual({ "ns.active": false });
  });

  it("does not overwrite values already in the new layout", () => {
    const plan = NS.planMigration({ showComments: true, "youtube.hideComments": true }, { "ns.active": true }, { fromLegacy: true });
    expect(plan.syncSet["youtube.hideComments"]).toBeUndefined();
    expect(plan.localSet).toEqual({});
  });
});

describe("runMigration", () => {
  it("rewrites storage and is idempotent", async () => {
    api.storage.sync._seed({ showVideoTime: true, enableAutoplay: false, originalAutoplay: false });
    api.storage.local._seed({ YouTubeNoSpoilersActive: true });

    await NS.runMigration({ fromLegacy: true });
    expect(api.storage.sync._dump()).toEqual({
      "ns.schema": 2,
      "youtube.hideVideoTime": false,
      "youtube.disableAutoplay": true,
    });
    expect(api.storage.local._dump()).toEqual({ "ns.active": true });

    expect(await NS.runMigration({ fromLegacy: true })).toBeNull();
  });

  it("recognises 0.9.x versions", () => {
    expect(NS.isLegacyVersion("0.9.9")).toBe(true);
    expect(NS.isLegacyVersion("1.0.0")).toBe(false);
    expect(NS.isLegacyVersion(undefined)).toBe(false);
  });
});

describe("settings writes", () => {
  it("writes flat keys and resets a platform", async () => {
    await NS.setOption("youtube", "hideComments", false);
    await NS.setPlatformEnabled("youtube", false);
    await NS.setActive(false);
    let state = await NS.readState();
    expect(state.platforms.youtube.options.hideComments).toBe(false);
    expect(state.platforms.youtube.enabled).toBe(false);
    expect(state.active).toBe(false);

    await NS.resetPlatform("youtube");
    state = await NS.readState();
    expect(state.platforms.youtube.options.hideComments).toBe(true);
    expect(state.platforms.youtube.enabled).toBe(true);
  });

  it("recognises settings changes", () => {
    expect(NS.isSettingsChange({ "ns.active": {} }, "local")).toBe(true);
    expect(NS.isSettingsChange({ "youtube.autoplayRestore": {} }, "local")).toBe(false);
    expect(NS.isSettingsChange({ "twitch.maskTitles": {} }, "sync")).toBe(true);
    expect(NS.isSettingsChange({ "ns.schema": {} }, "sync")).toBe(false);
  });
});
