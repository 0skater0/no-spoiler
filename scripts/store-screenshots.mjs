// Renders the store screenshots of the popup and the settings page (1280x800)
// and the Chrome promo tiles from the Chrome build into docs/store/ (RGB). Run
// locally and commit the result; the release workflow uploads the committed files.
// Usage: node scripts/store-screenshots.mjs [--out <dir>]
// Needs Google Chrome installed (Playwright channel "chrome").
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "./build.mjs";
import { withExtension } from "./lib/headless-chrome.mjs";
import { discoverPlatforms } from "./lib/platforms.mjs";
import { assertRgbPng } from "./lib/png.mjs";
import { fitText } from "./store/fit-text.mjs";
import { resampleImages } from "./store/resample.mjs";
import { extensionPageCss, marqueeHtml, optionsHtml, popupHtml, smallPromoHtml } from "./store/templates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "scripts", "store");
const WIDTH = 1280;
const HEIGHT = 800;

const { values } = parseArgs({ options: { out: { type: "string", default: path.join(ROOT, "docs", "store") } } });
const P = JSON.parse(readFileSync(path.join(STORE, "params.json"), "utf8"));
const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString("base64")}`;
const fontUrl = dataUrl("font/ttf", readFileSync(path.join(STORE, "fonts", "Inter.ttf")));
const pageCss = extensionPageCss(fontUrl, P);

// Waits for web fonts and for the asynchronous first render of the page script.
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/**
 * Captures the top-left width x height CSS pixels at captureScale. Over CDP,
 * because Playwright's own screenshot resets the device scale factor to 1.
 */
async function captureHiDpi(page, url, { width, height, colorScheme, prepare }) {
  await page.emulateMedia({ colorScheme });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: P.captureScale,
    mobile: false,
  });
  await page.goto(url);
  await page.addStyleTag({ content: pageCss });
  const clipHeight = (await prepare?.(page)) ?? height;
  await settle(page);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height: clipHeight, scale: 1 },
  });
  return { url: dataUrl("image/png", Buffer.from(data, "base64")), width, height: clipHeight };
}

async function setDetailsOpen(page, platform, open) {
  const details = page.locator(`details[data-platform="${platform}"]`);
  if ((await details.evaluate((d) => d.open)) !== open) await details.locator("> summary").click();
}

async function capturePopup(ctx, id) {
  const page = await ctx.newPage();
  const shot = await captureHiDpi(page, `chrome-extension://${id}/popup/popup.html`, {
    width: P.popup.width,
    height: 1600,
    colorScheme: "dark",
    async prepare() {
      await page.waitForSelector("details[data-platform]");
      await page.addStyleTag({ content: "body.ns-popup { max-height: none !important; }" });
      await setDetailsOpen(page, "youtube", true);
      await setDetailsOpen(page, "twitch", false);
      await settle(page);
      return Math.ceil((await page.locator("body").boundingBox()).height);
    },
  });
  await page.close();
  return shot;
}

async function captureOptions(ctx, id) {
  const page = await ctx.newPage();
  const shot = await captureHiDpi(page, `chrome-extension://${id}/options/options.html`, {
    width: P.options.viewport,
    height: P.options.captureHeight,
    colorScheme: "light",
    async prepare() {
      await page.waitForSelector("[data-platform] fieldset");
    },
  });
  await page.close();
  return shot;
}

async function storeSettings(ctx, id) {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/options/options.html`);
  await page.waitForSelector("[data-platform]");
  await page.evaluate((s) => chrome.storage.sync.set(s), P.storage);
  await page.close();
}

async function render(ctx, html, width, height) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  await page.evaluate(resampleImages);
  await settle(page);
  await page.evaluate(fitText, P.fitMinScale);
  // The page background is opaque, so Chrome writes RGB without alpha; checked below.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  await page.close();
  return png;
}

const sites = (await discoverPlatforms(path.join(ROOT, "src"))).map((p) => p.label);
const { out } = await build("chrome");
mkdirSync(values.out, { recursive: true });
const logoUrl = dataUrl("image/png", readFileSync(path.join(out, "icons", "on-128.png")));

await withExtension(out, async (ctx, id) => {
  await storeSettings(ctx, id);
  const popup = await capturePopup(ctx, id);
  const options = await captureOptions(ctx, id);
  // The popup fills the frame height, the settings page the card width.
  const popupWidth = Math.round((popup.width * P.popup.height) / popup.height);
  const optionsHeight = Math.round((options.height * P.options.width) / options.width);
  const popupUi = { uiUrl: popup.url, uiWidth: popupWidth, uiHeight: P.popup.height };
  const { marquee, small } = P;
  const shots = [
    ["screenshot-1-popup-1280x800.png", WIDTH, HEIGHT, popupHtml({ fontUrl, logoUrl, sites, ...popupUi }, P.popup)],
    ["screenshot-3-settings-1280x800.png", WIDTH, HEIGHT, optionsHtml({ fontUrl, uiUrl: options.url, uiHeight: optionsHeight }, P.options)],
    // The marquee shows the top of the popup at the scale of screenshot-1.
    ["promo-marquee-1400x560.png", marquee.width, marquee.height, marqueeHtml({ fontUrl, logoUrl, sites, ...popupUi }, marquee)],
    ["promo-small-440x280.png", small.width, small.height, smallPromoHtml({ fontUrl, logoUrl, sites }, small)],
  ];
  for (const [name, width, height, html] of shots) {
    const png = await render(ctx, html, width, height);
    assertRgbPng(png, width, height, name);
    writeFileSync(path.join(values.out, name), png);
    console.log(`Wrote ${path.relative(ROOT, path.join(values.out, name))}`);
  }
});
