// HTML and CSS for the store screenshots: the styles injected into the extension
// pages before capturing, and the compositions around the captures: the 1280x800
// screenshots and the Chrome promo tiles.
import { joinLabels } from "../lib/platforms.mjs";

export function fontFace(fontUrl) {
  return `@font-face { font-family: "Inter"; src: url(${fontUrl}); font-weight: 100 900; }`;
}

/**
 * Styles for the extension pages: the bundled font instead of the system UI font,
 * and the summary triangles drawn as shapes, so the result does not depend on the
 * symbol fonts of the machine.
 */
export function extensionPageCss(fontUrl, { marker }) {
  return `${fontFace(fontUrl)}
body, button, input, select, textarea { font-family: "Inter", sans-serif !important; }
*, *::before, *::after { transition: none !important; animation: none !important; }
summary.ns-platform__header::before {
  content: "" !important;
  flex: none;
  align-self: center;
  width: ${marker.size}px;
  height: ${marker.size}px;
  margin-right: ${marker.advance - marker.size + 4}px;
  background: currentColor;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}
details[open] > summary.ns-platform__header::before { clip-path: polygon(0 0, 100% 0, 50% 100%); }`;
}

function pageBase(width = 1280, height = 800) {
  return `html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; font-optical-sizing: none; }
body { position: relative; font-family: "Inter"; }`;
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A text line that fitText() shrinks, and wraps if that is not enough, to stay
 * within maxWidth. The promo texts sit in a column, so a wrapped line pushes the
 * lines below it down instead of overlapping them.
 */
const fitLine = (cls, text, maxWidth) =>
  `<p class="${cls}" style="white-space: nowrap; width: max-content" data-max-width="${maxWidth}">${escapeHtml(text)}</p>`;

// Line height of the promo lines that may wrap, and the space it adds above the glyphs.
const LINE_HEIGHT = 1.25;
const halfLeading = (size) => ((LINE_HEIGHT - 1) / 2) * size;

export function popupHtml({ fontUrl, logoUrl, uiUrl, uiWidth, sites }, p) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(fontUrl)}
${pageBase()}
body { background: linear-gradient(#1e1c28, #100f16); color: #f2f2f5; }
.logo { position: absolute; left: 80px; top: 92px; width: 72px; height: 72px; }
h1 { position: absolute; left: 80px; top: ${p.titleTop}px; margin: 0; font-size: ${p.titleSize}px; font-weight: 700; line-height: 1; }
.tag { position: absolute; left: 80px; top: ${p.tagTop}px; margin: 0; font-size: ${p.tagSize}px; line-height: ${p.tagLh}px; color: #aaaab6; font-weight: 400; }
ul { position: absolute; left: 80px; top: ${p.listTop}px; margin: 0; padding: 0; list-style: none; }
li { position: relative; padding-left: 24px; font-size: ${p.listSize}px; font-weight: 600; line-height: ${p.listLh}px; }
li::before { content: ""; position: absolute; left: 0; top: 50%; width: ${p.dot}px; height: ${p.dot}px; margin-top: -${p.dot / 2}px; border-radius: 50%; background: #d93025; }
.frame { position: absolute; left: ${p.right - uiWidth}px; top: ${p.top}px; width: ${uiWidth}px; height: ${p.height}px; border-radius: ${p.radius}px; overflow: hidden; box-shadow: ${p.shadow}; }
.frame > * { display: block; }
</style></head><body>
<img class="logo" src="${logoUrl}">
<h1>No Spoilers</h1>
<p class="tag">Hide what gives the result away<br>on ${escapeHtml(joinLabels(sites, "and"))}.</p>
<ul>${p.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
<div class="frame"><img src="${uiUrl}" data-width="${uiWidth}" data-height="${p.height}"></div>
</body></html>`;
}

export function optionsHtml({ fontUrl, uiUrl, uiHeight }, s) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(fontUrl)}
${pageBase()}
body { background: linear-gradient(#f4f4f7, #e2e2e9); }
h1 { position: absolute; left: 80px; top: ${s.titleTop}px; margin: 0; font-size: ${s.titleSize}px; font-weight: 700; line-height: 1; color: #1d1d22; }
p { position: absolute; left: 80px; top: ${s.subTop}px; margin: 0; font-size: ${s.subSize}px; line-height: 1; color: #63636e; }
.card { position: absolute; left: ${(1280 - s.width) / 2}px; top: 200px; width: ${s.width}px; height: 700px; background: #fff; border-radius: ${s.radius}px; overflow: hidden; box-shadow: ${s.shadow}; }
.card > * { display: block; }
</style></head><body>
<h1>Decide what you want to see</h1>
<p>All sites and options on one page. Changes apply in open tabs without reloading.</p>
<div class="card"><img src="${uiUrl}" data-width="${s.width}" data-height="${uiHeight}"></div>
</body></html>`;
}

/** Chrome marquee promo tile: name and claims on the left, the top of the popup on the right. */
export function marqueeHtml({ fontUrl, logoUrl, uiUrl, uiWidth, uiHeight, sites }, m) {
  const frameLeft = m.frameRight - uiWidth;
  const sitesTop = m.sitesTop - halfLeading(m.sitesSize);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(fontUrl)}
${pageBase(m.width, m.height)}
body { background: linear-gradient(#1e1c28, #100f16); color: #f2f2f5; }
.logo { position: absolute; left: ${m.left}px; top: ${m.logoTop}px; width: ${m.logoSize}px; height: ${m.logoSize}px; }
.text { position: absolute; left: ${m.left}px; top: ${m.titleTop}px; }
h1, p { margin: 0; }
h1 { font-size: ${m.titleSize}px; font-weight: 700; line-height: 1; }
.sites { margin-top: ${sitesTop - m.titleTop - m.titleSize}px; font-size: ${m.sitesSize}px; font-weight: 600; line-height: ${LINE_HEIGHT}; color: #e6e6ec; }
.sub { margin-top: ${m.subTop - sitesTop - LINE_HEIGHT * m.sitesSize}px; font-size: ${m.subSize}px; line-height: ${m.subLh}px; color: #aaaab6; }
.frame { position: absolute; left: ${frameLeft}px; top: ${m.frameTop}px; width: ${uiWidth}px; height: ${m.frameHeight}px; border-radius: ${m.radius}px; overflow: hidden; box-shadow: ${m.shadow}; }
.frame > * { display: block; }
</style></head><body>
<img class="logo" src="${logoUrl}" data-width="${m.logoSize}" data-height="${m.logoSize}">
<div class="text">
<h1>No Spoilers</h1>
${fitLine("sites", `for ${joinLabels(sites)}`, frameLeft - m.left - m.gap)}
<p class="sub">Hide time, progress, chat and titles.<br>Watch without knowing how it ends.</p>
</div>
<div class="frame"><img src="${uiUrl}" data-width="${uiWidth}" data-height="${uiHeight}"></div>
</body></html>`;
}

/** Chrome small promo tile: icon on the left, name and claims next to it. */
export function smallPromoHtml({ fontUrl, logoUrl, sites }, s) {
  const maxWidth = s.width - s.textLeft - s.margin;
  const sitesTop = s.sitesTop - halfLeading(s.sitesSize);
  const subTop = s.subTop - halfLeading(s.subSize);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace(fontUrl)}
${pageBase(s.width, s.height)}
body { background: linear-gradient(#1c1b22, #25202f); color: #fff; }
.logo { position: absolute; left: ${s.logoLeft}px; top: ${s.logoTop}px; width: ${s.logoSize}px; height: ${s.logoSize}px; }
.text { position: absolute; left: ${s.textLeft}px; top: ${s.titleTop}px; }
h1, p { margin: 0; }
h1 { font-size: ${s.titleSize}px; font-weight: 700; line-height: 1; }
p { line-height: ${LINE_HEIGHT}; }
.sites { margin-top: ${sitesTop - s.titleTop - s.titleSize}px; font-size: ${s.sitesSize}px; color: #edeef7; }
.sub { margin-top: ${subTop - sitesTop - LINE_HEIGHT * s.sitesSize}px; font-size: ${s.subSize}px; color: #b9bac6; }
</style></head><body>
<img class="logo" src="${logoUrl}" data-width="${s.logoSize}" data-height="${s.logoSize}">
<div class="text">
<h1>No Spoilers</h1>
${fitLine("sites", `for ${joinLabels(sites)}`, maxWidth)}
${fitLine("sub", "Hide time, progress, chat, titles", maxWidth)}
</div>
</body></html>`;
}
