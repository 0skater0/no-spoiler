# Testing

## Automated

```bash
npm ci
npm test        # unit tests: core, migration, platform modules against DOM fixtures, build output
npm run lint    # web-ext lint on dist/firefox
```

The platform tests check the stylesheets and the JavaScript hooks against
the fixtures in `test/fixtures/`. They prove that the selectors match the
fixture markup. Whether the fixtures still match the live sites can only be
checked in a browser, see below.

## Manual checklist

Build first: `npm run build`.

### Load the extension

- Firefox: `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" →
  `dist/firefox/manifest.json`.
- Chrome: `chrome://extensions` → Developer mode → "Load unpacked" → `dist/chrome`.

### Update from 0.9.x (Firefox)

Real update path:

1. Install 0.9.9 from AMO in a fresh profile, change a few settings
   (e.g. show video time, enable skip buttons) and switch it on.
2. Load `dist/firefox` as temporary add-on. Firefox replaces the installed
   version (same ID) and fires `onInstalled` with `reason: "update"`.
3. Open the popup: the YouTube options match what was set in 0.9.9, and the
   on/off state is kept.

Shortcut via the background console (`about:debugging` → Inspect):

```js
await browser.storage.sync.clear();
await browser.storage.local.clear();
await browser.storage.sync.set({ showVideoTime: true, showComments: false, enableAutoplay: true, enableSkipButtons: true });
await browser.storage.local.set({ YouTubeNoSpoilersActive: true });
await NoSpoiler.background.setup({ reason: "update", previousVersion: "0.9.9" });
await browser.storage.sync.get(null);
// expected: ns.schema 2, youtube.hideVideoTime false, youtube.hideComments true,
//           youtube.disableAutoplay false, youtube.skipButtons true; old keys gone
```

### General

- [ ] Fresh install: icon is red, protection is on.
- [ ] Shortcut (Firefox `Ctrl+Alt+U`, Chrome `Alt+Shift+U`) switches protection; icon turns grey/red.
- [ ] Popup on YouTube shows YouTube settings first, on Twitch Twitch first, elsewhere the overview.
- [ ] "All settings" opens the options page.
- [ ] Changing an option in the popup changes an open tab immediately, without reload.
- [ ] Tabs that were open before installing the extension are protected without reload.

### YouTube

Watch page (`/watch?v=…`), regular video and a live stream or premiere:

- [ ] Time display hidden; the volume and buttons around it still visible.
- [ ] Progress bar, chapter title and hover preview hidden.
- [ ] End screen, end cards and the up-next overlay hidden at the end of a video.
- [ ] Autoplay switched off while active, switched back on when protection is turned off (only if it was on before).
- [ ] Skip buttons appear once next to the play button; still once after navigating to another video, entering and leaving fullscreen and the miniplayer.
- [ ] Comments, description, chapter panel, recommendations and live chat hidden.

Lists (home, search, channel videos, recommendations):

- [ ] No durations on thumbnails; LIVE, SHORTS and "New" badges still visible.
- [ ] No red watch progress bars on thumbnails.
- [ ] Hovering a thumbnail (inline preview) shows no time or progress.

### Twitch

First grant access in the popup.

Video page (`/videos/<id>`):

- [ ] Current time and duration hidden.
- [ ] Seek bar shows a neutral track; clicking and dragging still seeks.
- [ ] No preview or time when hovering the seek bar.
- [ ] Chat replay hidden.
- [ ] End-of-video recommendations / countdown hidden.
- [ ] Optional: titles show "Title hidden"; tooltips gone.

Clip page (`/<channel>/clip/<slug>`, `clips.twitch.tv/<slug>`):

- [ ] Time, duration and seek bar progress hidden.

Lists (directory, channel videos and clips tabs, search):

- [ ] Video and clip thumbnails blurred, live thumbnails not (unless enabled).
- [ ] No lengths on video and clip cards; views and dates still visible.
- [ ] No video preview when hovering cards.

Live channel:

- [ ] Uptime hidden.

## When something is not hidden

The site probably changed its markup. In the browser's inspector, find the
element, note its stable attributes (`data-a-target`, `data-test-selector`,
`aria-*`, tag names), add a reduced copy to the fixtures with
`data-expect-hidden="<option>"`, extend the selector list in the platform's
`content.css` or `content.js`, and run `npm test`.
