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
   below). Screenshots: see [Graphics](#graphics).

Data collection: the manifest declares `data_collection_permissions: none`.

## Chrome Web Store

Listing: <https://chromewebstore.google.com/detail/hmklilohlfdjlhpmdlidpfklabdopahk> (item ID `hmklilohlfdjlhpmdlidpfklabdopahk`, the value for the `CWS_EXTENSION_ID` secret).

1. Register at <https://chrome.google.com/webstore/devconsole> (one-time
   registration fee).
2. *New item* → upload `no-spoiler-chrome-<version>.zip`.
3. *Store listing*: texts below, category *Productivity* (or *Entertainment*),
   language English.
4. Graphics: the 128 px icon is in the package (`icons/on-128.png`). The store
   needs at least one screenshot of 1280×800 or 640×400 px, and a small promo
   tile of 440×280 px: `docs/store/promo-small-440x280.png`. See
   [Graphics](#graphics).
5. *Privacy practices*: single purpose and permission justifications below;
   data usage: no data collected; privacy policy URL:
   `https://github.com/0skater0/no-spoiler/blob/main/PRIVACY.md`.
6. Submit for review.

## Automatic submission from the release workflow

Pushing a tag `vX.Y.Z` builds both packages, creates the GitHub release and,
if the secrets below exist, submits the new version to both stores. Without
the secrets these steps are skipped and you upload by hand as described above.
Add the secrets under *Settings → Secrets and variables → Actions → New
repository secret*.

Both stores still review every version; the workflow only submits it.

Each store has its own job. If one upload fails, the other store still gets
the version, and *Re-run failed jobs* repeats only the store that failed. The
built packages are kept for 7 days; after that, push a fixed tag or upload by
hand.

### Firefox

1. AMO Developer Hub → *Tools* → *Manage API Keys* → generate credentials.
2. Secrets: `AMO_JWT_ISSUER` (the "JWT issuer") and `AMO_JWT_SECRET` (the
   "JWT secret").

The workflow runs `scripts/publish-firefox.mjs` (`web-ext sign --channel
listed`) with the changelog section as release notes, and does not wait for
the review. If the screenshots changed since the previous tag, it then runs
`scripts/sync-amo-previews.mjs` with the same credentials (see
[Graphics](#graphics)).

### Chrome

The item has to exist first: create it once by hand (see above). Then:

1. In the developer dashboard, note the **item ID** of the extension and
   your **publisher ID** (shown in the dashboard URL).
2. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project, enable the *Chrome Web Store API* and configure the OAuth consent
   screen (*Google Auth Platform*, audience *External*). Under *Branding*, fill
   in the support email, the home page (the repository URL), the privacy
   policy (`PRIVACY.md` on GitHub) and `github.com` as authorised domain, and
   leave the logo empty (a logo requires Google's verification). Then
   **publish** the app to production under *Audience*: in testing mode Google
   blocks the sign-in for anyone not listed as test user, and the refresh
   token expires after seven days.
3. Create an OAuth client ID (type *Web application*, authorised redirect URI
   `https://developers.google.com/oauthplayground`).
4. In the [OAuth Playground](https://developers.google.com/oauthplayground):
   gear icon → *Use your own OAuth credentials* (client ID and secret from
   step 3), scope `https://www.googleapis.com/auth/chromewebstore`,
   *Authorize APIs* (sign in with the account that owns the developer
   dashboard; on "Google hasn't verified this app" choose *Advanced* → *Go to
   …*), *Exchange authorization code for tokens*, copy the refresh token. If
   the exchange answers `internal_failure`, the new client is not active yet:
   wait a few minutes and authorize again, a code works only once.
5. Secrets: `CWS_EXTENSION_ID`, `CWS_PUBLISHER_ID`, `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

The workflow runs `scripts/publish-chrome.mjs`: upload through the Chrome Web
Store API v2, then submit for review. The API cannot change listing images;
screenshots stay a manual step (see [Graphics](#graphics)).

These steps follow the Chrome Web Store API documentation as of 2026; if
Google changed the console, its current guide wins.

## Texts

### Name

```
No Spoilers
```

### Summary (AMO ≤ 250 characters; Chrome takes the manifest description)

```
Hide spoilers on YouTube, Twitch and Kick: video time, progress bars, durations, chat, titles and recommendations. Choose what you want to see, and jump through videos without seeing where you are.
```

### Description, AMO (Markdown)

```
Watch sports, esports and long streams **without knowing how they end**.

No Spoilers hides what gives the result away, and lets you decide what else you want to see. Everything is switched per site in the toolbar popup and takes effect immediately, without reloading the page.

**YouTube**

- Current time, duration and progress bar in the player
- Durations and watch progress on thumbnails
- Comments, description and chapters, recommendations, live chat
- End screen and end cards, autoplay
- Optional: video titles, including the browser tab

**Twitch**

- Time and seek bar in the player, seek preview
- Lengths of videos and clips, watch progress, blurred thumbnails
- Chat on videos and live streams (collapsed with Twitch's own button)
- End-of-video recommendations, stream uptime
- Optional: titles, category, tags, streamer avatar and name, home page carousel, sidebar recommendations

**Kick**

- Time, seek bar and seek preview in the player, stream uptime
- Lengths of videos and clips, blurred thumbnails, clip previews on hover
- Chat replay on videos (collapsed with Kick's own button)
- Optional: start live streams from the beginning, titles, category, tags, streamer avatar and name, home page carousel, sidebar recommendations

**Jump buttons**

Jump back and forward without seeing where you are: buttons next to play and in the middle of the video. You choose the jump sizes.

**Good to know**

- The whole protection switches on and off with one click on the icon or with `Ctrl+Alt+U`.
- You choose the sites: the add-on runs only on the sites you allowed (YouTube, Twitch, Kick).
- No data collection, no network requests.
- Open source: [github.com/0skater0/no-spoiler](https://github.com/0skater0/no-spoiler)
```

### Description, Chrome (plain text, no Markdown)

```
Watch sports, esports and long streams without knowing how they end.

No Spoilers hides what gives the result away, and lets you decide what else you want to see. Everything is switched per site in the toolbar popup and takes effect immediately, without reloading the page.

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

KICK
• Time, seek bar and seek preview in the player, stream uptime
• Lengths of videos and clips, blurred thumbnails, clip previews on hover
• Chat replay on videos (collapsed with Kick's own button)
• Optional: start live streams from the beginning, titles, category, tags, streamer avatar and name, home page carousel, sidebar recommendations

JUMP BUTTONS
Jump back and forward without seeing where you are: buttons next to play and in the middle of the video. You choose the jump sizes.

GOOD TO KNOW
• The whole protection switches on and off with one click on the icon or with Alt+Shift+U.
• You choose the sites: the extension runs only on the sites you allowed (YouTube, Twitch, Kick).
• No data collection, no network requests.
• Open source: https://github.com/0skater0/no-spoiler
```

### Single purpose (Chrome)

```
Hides spoiler-prone page elements (video time, progress bars, durations, chat, titles, recommendations) on video sites and adds jump buttons to their players.
```

### Permission justifications (Chrome)

- `storage`:
  ```
  Stores the user's settings and the on/off state.
  ```
- `scripting`:
  ```
  Registers the content script of a site (YouTube, Twitch, Kick) after the user granted the optional access to it, and applies the extension to tabs that were already open.
  ```
- `activeTab`:
  ```
  The popup reads the current tab's address to show that site's settings first.
  ```
- Host permissions:
  ```
  The extension requests no host permissions at install time. Access to *://*.youtube.com/*, https://*.twitch.tv/*, https://kick.com/* and https://*.kick.com/* is optional and requested only when the user enables that site; the content script then hides elements on its pages.
  ```
- Remote code: none.

### Graphics

All in `docs/store/`. The popup and settings page in them are screenshots of the real extension UI:

| File | Use |
|---|---|
| `promo-small-440x280.png` | Chrome: small promo tile |
| `promo-marquee-1400x560.png` | Chrome: marquee promo tile |
| `screenshot-1-popup-1280x800.png`, `screenshot-2-jump-buttons-1280x800.png`, `screenshot-3-settings-1280x800.png` | Chrome and AMO: screenshots (RGB, no alpha), in this order |
| `captions.json` | AMO: caption per screenshot (English) |

All images are 8-bit RGB without alpha; `npm test` checks that.

#### Rendering the screenshots and promo tiles

```bash
npm ci
npm run store:screenshots
```

`scripts/store-screenshots.mjs` builds `dist/chrome`, loads it into one
headless, muted Google Chrome (must be installed), captures the popup and the
settings page at twice the size and composes `screenshot-1`, `screenshot-3`
and both promo tiles from `scripts/store/` (layout and texts in
`templates.mjs`, sizes and stored settings in `params.json`, font Inter under
the SIL Open Font License in `fonts/`). The list of sites in the texts comes
from the `label` and `order` of `src/platforms/*/platform.json`; if it gets too
long for a line, the line shrinks a little and then wraps. Commit the result:
the release takes the images from the tag and does not render them in CI,
because the rendering differs slightly between machines. On one machine the
output is byte-for-byte reproducible.

Only `screenshot-2` is made by hand. Screenshots of the real
sites (YouTube, Twitch, Kick) have to be taken by hand too; resize them to 1280×800
without transparency and add a caption to `captions.json`. The file name order
is the display order.

#### Getting the screenshots into the stores

On each release tag, the workflow compares `docs/store/screenshot-*.png` and
`captions.json` with the previous tag (the first tag always counts as
changed). The release always has `docs/store/*.png` attached.

- **AMO, automatic:** if they changed, `scripts/sync-amo-previews.mjs` uploads
  all screenshots in file order with position and caption, then deletes the
  previous ones, so the listing never runs empty. AMO resizes each upload in
  a background task that saves the whole preview and so overwrites a caption
  set before it ends; the script therefore waits until the listing reports
  the image sizes of the new preview (at most 3 minutes), then sets position
  and caption and reads them back. The listing screenshots
  change with the tag, so the store shows them while the new version is
  still in the AMO review. If an upload or PATCH request fails or a resize
  does not finish in time, the script removes the previews it already
  created, since an unresized preview is not trustworthy. If a caption or
  position still does not stick after a second PATCH, the new images stay:
  the script finishes the sync, deletes the old previews and then fails with
  the previews whose caption is wrong, to be fixed with the *captions-only*
  repair below. If only deleting the old ones fails, the new set stays and
  the old ones remain next to it. AMO allows 3 writes per minute, 10 per
  hour and 24 per day per user, shared with the version submission; a
  request rejected by one window still counts in the others. A sync makes 6
  writes, up to 9 when captions have to be set again, plus one DELETE per
  old preview (9 to 12 with three old ones), so after a release it usually takes a little over an hour: the
  script logs and waits the time AMO names, which can exceed an hour when
  the daily window is full. It fails at once when a wait would end after
  the 170-minute budget, so the warning comes before the 180-minute step
  timeout. It also gives up after six throttled retries of one request. After a
  throttle failure the rollback usually fails too and leaves new previews
  next to the old ones; the repair run replaces all of them. A release and
  a failed sync use up much of the daily limit, so start the repair at
  least 24 hours after the failed run: an earlier one waits for writes to
  leave the daily window and can run out of budget. A
  failure leaves a warning in the run and a note in the run summary; the
  release goes on.
  To repair, run the workflow *Sync AMO screenshots* (*Actions* tab, *Run
  workflow*, choose the release tag, or `main` while its screenshots are
  those of the release): it replaces all previews on the listing with the
  ones of that ref, *dry-run* only prints the plan. If only captions or
  positions are wrong, *captions-only* keeps the images: it pairs the
  previews in listing order with the screenshots in file order, refuses to
  write when the counts differ, and patches only the previews whose English
  caption or position differs, one write each, two if the caption has to be
  set again. Locally
  the same works with the AMO credentials in `AMO_JWT_ISSUER` and
  `AMO_JWT_SECRET`: `node scripts/sync-amo-previews.mjs [--captions-only] [--dry-run]`.
- **Chrome, manual:** if they changed, the run summary says so. Replace the
  screenshots in the developer dashboard under *Store listing* with the files
  from the release or from `docs/store/`.
