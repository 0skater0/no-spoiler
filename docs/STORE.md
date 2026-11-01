# Store publishing

Notes and ready-to-paste texts for addons.mozilla.org (AMO) and the Chrome Web
Store. Build the packages first:

```bash
npm ci
npm run package
```

This writes `dist/no-spoiler-firefox-<version>.zip` and
`dist/no-spoiler-chrome-<version>.zip`. A tagged release on GitHub has the
same files attached.

## Firefox (addons.mozilla.org)

Existing listing: <https://addons.mozilla.org/firefox/addon/no-spoilers-youtube/>.
The Gecko ID `{d27fe5e6-f507-492e-b030-1a17debff539}` is unchanged, so the new
version is an update of that listing.

1. Developer Hub → *My Add-ons* → *No Spoilers: Youtube* → *Upload New Version*.
2. Upload `no-spoiler-firefox-<version>.zip`, platforms *Firefox* (desktop).
3. *Do you need to submit source code?* → **No**. The package contains the
   source as it is in the repository; nothing is minified, bundled or
   transpiled. `core/platforms.generated.js` is plain, readable data generated
   from `src/platforms/*/platform.json`.
4. Release notes: copy the version's section from `CHANGELOG.md`.
5. Afterwards, in *Edit Product Page*: the manifest name is now *No Spoilers*;
   check that the listing name, summary and description match (see texts
   below), and replace the screenshots.

Data collection: the manifest declares `data_collection_permissions: none`.

## Chrome Web Store

A new item; Chrome has no relation to the Firefox listing.

1. Register at <https://chrome.google.com/webstore/devconsole> (one-time
   registration fee).
2. *New item* → upload `no-spoiler-chrome-<version>.zip`.
3. *Store listing*: texts below, category *Productivity* (or *Entertainment*),
   language English.
4. Graphics: the 128 px icon is in the package (`icons/on-128.png`). The store
   needs at least one screenshot of 1280×800 or 640×400 px, optionally a
   small promo tile of 440×280 px.
5. *Privacy practices*: single purpose and permission justifications below;
   data usage: no data collected; privacy policy URL:
   `https://github.com/0skater0/no-spoiler/blob/main/PRIVACY.md`.
6. Submit for review.

## Texts

**Name:** No Spoilers

**Summary (≤ 132 characters):**
Hide spoilers on YouTube and Twitch: time, progress bars, durations, chat, titles and recommendations. Adds jump buttons.

**Description:**

```
Watch sports, esports and long streams without knowing how they end.

No Spoilers hides what gives the result away, and lets you decide what else you want to see.

YOUTUBE
• Current time, duration and progress bar in the player
• Durations and watch progress on thumbnails
• Comments, description and chapters, recommendations, live chat
• End screen and end cards, autoplay
• Optional: video titles, including the browser tab

TWITCH
• Time and seek bar in the player, seek preview
• Lengths of videos and clips, watch progress, blurred thumbnails
• Chat on videos and live streams (collapsed with Twitch's own button)
• End-of-video recommendations, stream uptime
• Optional: titles, category, tags, streamer avatar and name, home page carousel, sidebar recommendations

JUMP BUTTONS
Jump back and forward without seeing where you are: buttons next to play and in the middle of the video. You choose the jump sizes.

Everything is switched per site in the popup, takes effect immediately without reloading, and the whole protection toggles with one click or a keyboard shortcut.

No data collection, no network requests. Open source: https://github.com/0skater0/no-spoiler
```

**Single purpose (Chrome):**
Hides spoiler-prone page elements (video time, progress bars, durations, chat, titles, recommendations) on video sites and adds jump buttons to their players.

**Permission justifications (Chrome):**

- `storage`: stores the user's settings and the on/off state.
- `scripting`: registers the Twitch content script after the user granted optional Twitch access, and applies the extension to tabs that were already open at install time.
- `activeTab`: the popup reads the current tab's address to show that site's settings first.
- Host permission `*://*.youtube.com/*`: the content script hides elements on YouTube pages.
- Optional host permission `https://*.twitch.tv/*`: same on Twitch, requested only when the user enables Twitch.
- Remote code: none.
