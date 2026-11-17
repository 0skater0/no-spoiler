// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertQuietLaunch, launchOptions } from "../scripts/lib/headless-chrome.mjs";
import { joinLabels } from "../scripts/lib/platforms.mjs";
import { assertRgbPng, pngInfo } from "../scripts/lib/png.mjs";
import { popupHtml, smallPromoHtml } from "../scripts/store/templates.mjs";
import PARAMS from "../scripts/store/params.json" with { type: "json" };
import { ROOT } from "./helpers/env.js";

describe("headless Chrome launch", () => {
  it("runs headless and muted", () => {
    const options = launchOptions();
    expect(() => assertQuietLaunch(options)).not.toThrow();
    expect(options.headless).toBe(true);
    expect(options.args).toContain("--mute-audio");
  });

  it("rejects anything that could play sound or show a window", () => {
    const base = launchOptions();
    expect(() => assertQuietLaunch({ ...base, headless: false })).toThrow(/headless/);
    expect(() => assertQuietLaunch({ ...base, args: base.args.filter((a) => a !== "--mute-audio") })).toThrow(/mute/);
    expect(() =>
      assertQuietLaunch({ ...base, args: [...base.args, "--autoplay-policy=no-user-gesture-required"] }),
    ).toThrow(/Autoplay/);
    expect(() => assertQuietLaunch({ ...base, ignoreDefaultArgs: true })).toThrow(/mute/);
  });
});

describe("site list in the store texts", () => {
  it("joins the labels with commas and the conjunction before the last", () => {
    expect(joinLabels([])).toBe("");
    expect(joinLabels(["YouTube"])).toBe("YouTube");
    expect(joinLabels(["YouTube", "Twitch"])).toBe("YouTube & Twitch");
    expect(joinLabels(["YouTube", "Twitch", "Kick"])).toBe("YouTube, Twitch & Kick");
    expect(joinLabels(["YouTube", "Twitch", "Kick"], "and")).toBe("YouTube, Twitch and Kick");
  });

  it("escapes the bullet texts of the popup screenshot", () => {
    const html = popupHtml({ sites: ["YouTube"] }, { ...PARAMS.popup, bullets: ["Chat & <b>titles</b>"] });
    expect(html).toContain("<li>Chat &amp; &lt;b&gt;titles&lt;/b&gt;</li>");
  });

  it("is generated into the templates", () => {
    const sites = ["YouTube", "Twitch", "Kick", "Vimeo"];
    expect(popupHtml({ sites }, PARAMS.popup)).toContain("on YouTube, Twitch, Kick and Vimeo.");
    expect(smallPromoHtml({ sites }, PARAMS.small)).toContain("for YouTube, Twitch, Kick &amp; Vimeo");
  });
});

describe("store images", () => {
  const STORE = path.join(ROOT, "docs", "store");

  it.each([
    ["screenshot-1-popup-1280x800.png", 1280, 800],
    ["screenshot-2-jump-buttons-1280x800.png", 1280, 800],
    ["screenshot-3-settings-1280x800.png", 1280, 800],
    ["promo-small-440x280.png", 440, 280],
    ["promo-marquee-1400x560.png", 1400, 560],
  ])("%s is 8-bit RGB without alpha in the right size", (name, w, h) => {
    expect(() => assertRgbPng(readFileSync(path.join(STORE, name)), w, h, name)).not.toThrow();
  });

  it("has a caption for every screenshot", () => {
    const captions = JSON.parse(readFileSync(path.join(STORE, "captions.json"), "utf8"));
    const screenshots = readdirSync(STORE).filter((f) => /^screenshot-.*\.png$/.test(f));
    expect(screenshots.length).toBeGreaterThan(0);
    for (const name of screenshots) expect(captions[name], name).toBeTruthy();
  });

  it("detects an alpha channel", () => {
    const png = Buffer.from(readFileSync(path.join(STORE, "promo-small-440x280.png")));
    png[25] = 6;
    expect(pngInfo(png).colorType).toBe(6);
    expect(() => assertRgbPng(png, 440, 280)).toThrow(/color type 6/);
  });
});
