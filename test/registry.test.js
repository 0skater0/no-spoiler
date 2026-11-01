import { beforeEach, describe, expect, it } from "vitest";
import { loadExtension } from "./helpers/env.js";

let NS;
beforeEach(async () => {
  ({ NS } = await loadExtension());
});

describe("match patterns", () => {
  it("matches YouTube hosts including the bare domain", () => {
    const yt = NS.getPlatform("youtube");
    for (const url of [
      "https://www.youtube.com/watch?v=x",
      "https://youtube.com/",
      "https://m.youtube.com/watch?v=x",
      "http://www.youtube.com/",
    ]) {
      expect(NS.urlMatches(url, yt.matches), url).toBe(true);
    }
    expect(NS.urlMatches("https://notyoutube.com/", yt.matches)).toBe(false);
    expect(NS.urlMatches("https://youtube.com.evil.test/", yt.matches)).toBe(false);
  });

  it("matches Twitch subdomains over https only", () => {
    const tw = NS.getPlatform("twitch");
    expect(NS.urlMatches("https://www.twitch.tv/videos/1", tw.matches)).toBe(true);
    expect(NS.urlMatches("https://clips.twitch.tv/Slug", tw.matches)).toBe(true);
    expect(NS.urlMatches("http://www.twitch.tv/", tw.matches)).toBe(false);
  });

  it("finds the platform for a URL", () => {
    expect(NS.platformForUrl("https://www.youtube.com/")?.id).toBe("youtube");
    expect(NS.platformForUrl("https://www.twitch.tv/somechannel")?.id).toBe("twitch");
    expect(NS.platformForUrl("https://example.org/")).toBeNull();
    expect(NS.platformForUrl("about:blank")).toBeNull();
    expect(NS.platformForUrl(undefined)).toBeNull();
  });

  it("rejects unsupported patterns", () => {
    expect(() => NS.matchPatternToRegExp("<all_urls>")).toThrow();
  });
});

describe("state", () => {
  it("orders platforms and applies defaults", () => {
    expect(NS.platforms.map((p) => p.id)).toEqual(["youtube", "twitch"]);
    const s = NS.defaultState();
    expect(s.active).toBe(true);
    expect(s.platforms.youtube.enabled).toBe(true);
    expect(s.platforms.youtube.options.hideVideoTime).toBe(true);
    expect(s.platforms.youtube.options.skipButtons).toBe(false);
  });

  it("reads stored values and ignores wrong types and unknown keys", () => {
    const s = NS.stateFromStorage(
      { "youtube.hideComments": false, "youtube.enabled": false, "youtube.hideChat": "no", "foo.bar": true },
      { "ns.active": false },
    );
    expect(s.active).toBe(false);
    expect(s.platforms.youtube.enabled).toBe(false);
    expect(s.platforms.youtube.options.hideComments).toBe(false);
    expect(s.platforms.youtube.options.hideChat).toBe(true);
  });

  it("computes html classes", () => {
    const yt = NS.getPlatform("youtube");
    const s = NS.defaultState();
    s.platforms.youtube.options = Object.fromEntries(yt.options.map((o) => [o.key, false]));
    s.platforms.youtube.options.hideVideoTime = true;
    expect(NS.classesFor(yt, s)).toEqual(["ns-on", "ns-youtube-hideVideoTime"]);
    s.platforms.youtube.enabled = false;
    expect(NS.classesFor(yt, s)).toEqual([]);
    s.platforms.youtube.enabled = true;
    s.active = false;
    expect(NS.classesFor(yt, s)).toEqual([]);
  });
});
