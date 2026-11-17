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
// expected: ns.schema 3, youtube.hideCurrentTime false, youtube.hideDuration false,
//           youtube.hideComments true, youtube.disableAutoplay false,
//           youtube.skipButtons true; old keys gone
```

### Update from 1.1.x (split time options)

Via the background console (in Chrome, use `chrome` instead of `browser`):

```js
await browser.storage.sync.clear();
await browser.storage.sync.set({ "ns.schema": 2, "youtube.hideVideoTime": false, "twitch.hidePlayerTime": true });
await NoSpoiler.background.setup({ reason: "update", previousVersion: "1.1.0" });
await browser.storage.sync.get(null);
// expected: ns.schema 3, youtube.hideCurrentTime false, youtube.hideDuration false,
//           twitch.hideCurrentTime true, twitch.hideDuration true; old keys gone
```

### General

- [ ] Fresh install: the welcome page opens, the icon shows a red "!". After allowing a site the "!" disappears and the site is protected without reload.
- [ ] Update from 0.9.x (Firefox): if YouTube access was kept, no welcome page; otherwise the welcome page opens.
- [ ] Shortcut (Firefox `Ctrl+Alt+U`, Chrome `Alt+Shift+U`) switches protection; icon turns grey/red.
- [ ] Popup on YouTube shows YouTube settings first, on Twitch Twitch first, elsewhere the overview.
- [ ] "All settings" opens the options page.
- [ ] Changing an option in the popup changes an open tab immediately, without reload.
- [ ] Tabs that were open before installing the extension are protected without reload.

### YouTube

Watch page (`/watch?v=…`), regular video and a live stream or premiere:

- [ ] Time display hidden; the volume and buttons around it still visible.
- [ ] Only "Hide duration" on: the current time is visible, no "/" and no duration. Clicking the time to show the time left shows "Time left hidden"; clicking again shows the current time. The time left ("-8:37") may flash for up to about 150 ms after the click before it is replaced, because the page observer is throttled; longer than that is a bug.
- [ ] Only "Hide current time" on: the duration is visible, no "/" before it.
- [ ] Live stream with both on (default): no time, but the "Live" badge is visible; when behind the live edge, clicking it jumps to the live picture.
- [ ] Live stream with only one of the two on: nothing looks broken next to the "Live" badge.
- [ ] Progress bar, chapter title and hover preview hidden.
- [ ] End screen, end cards and the up-next overlay hidden at the end of a video.
- [ ] Autoplay switched off while active, switched back on when protection is turned off (only if it was on before).
- [ ] Skip buttons appear once next to the play button; still once after navigating to another video, entering and leaving fullscreen and the miniplayer.
- [ ] Comments, description, chapter panel, recommendations and live chat hidden.

Live from the start (switch on "Start live streams from the beginning"):

Do these checks with all other settings at their defaults, so with the
progress bar hidden. The jump is calculated from the progress bar's
`aria-valuenow`, and that has to keep updating while the bar is
`display: none`. The extension also needs `ytp-live` on the time display
by the time the video has loaded its metadata, also after navigating
without reload. Both can be checked in the page console (F12):

```js
// changes every second on a live stream, with the progress bar hidden
document.querySelector(".ytp-progress-bar").getAttribute("aria-valuenow");
// run on the home page, then click a live stream: expected true
document.addEventListener("loadedmetadata", () => console.log("ytp-live:", !!document.querySelector("#movie_player .ytp-time-display.ytp-live")), true);
```

- [ ] Open a stream that is live right now and can be rewound: the video area stays dark and silent for a moment, then playback starts at the earliest point you can rewind to, not at the live edge (switch "Hide progress bar" off afterwards to check the position). No live picture or sound before that.
- [ ] Same via a channel's `/live` URL and after clicking a live stream from the home page (navigation without reload).
- [ ] Live stream A, then a regular video, then back to A without reload: A starts from the beginning again.
- [ ] Clicking "Live" or seeking afterwards works and is not undone; quality changes do not jump back.
- [ ] A stream running longer than YouTube's rewind window starts at the oldest available point.
- [ ] A pre-roll ad plays normally; the stream itself then starts from the beginning.
- [ ] Regular videos, finished streams (VODs) and premieres play as usual; a live stream without rewind plays live.
- [ ] Option off: live streams open at the live edge. Switching the option on while watching does not jump.
- [ ] Muted before opening the stream: stays muted afterwards. Muting (`m`) while the video is dark: stays muted after the jump. Not muted: sound comes back at the previous volume after the jump, the volume slider shows that volume, and the next video plays at it too.
- [ ] Premiere in another interface language (e.g. Spanish, Japanese): plays as usual. Languages whose premiere label is unknown start from the beginning like a live stream.
- [ ] Reload the extension while a live stream is dark (`about:debugging` or `chrome://extensions`): the video does not stay dark or silent.

Lists (home, search, channel videos, recommendations):

- [ ] No durations on thumbnails; LIVE, SHORTS and "New" badges still visible.
- [ ] No red watch progress bars on thumbnails.
- [ ] Hovering a thumbnail (inline preview) shows no time or progress.

### Twitch

First grant access in the popup.

Video page (`/videos/<id>`):

- [ ] Current time and duration hidden.
- [ ] Only "Hide duration" on: the current time is visible on its usual side, the duration not. Only "Hide current time" on: the reverse.
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
- [ ] No time in the player bar next to the "LIVE" badge; the badge itself stays in place.
- [ ] With rewind (Turbo or a sub), after jumping back: neither the position nor the distance to the live edge ("-4:56:23") is visible in the player bar.
- [ ] "Hide stream time and distance to live in the player" off: both times show again without a reload.

Live from the start (switch on "Start live streams from the beginning"; needs
Twitch Turbo or a sub to the channel, and a channel that keeps its videos):

Do these checks with all other settings at their defaults, so with the seek
bar hidden. The extension clicks the start of the live player's seek bar
(`[data-a-target="player-seekbar"]`), which only exists with rewind; while
the video is dark, the hidden bar keeps its place but stays invisible.
Whether the account can rewind on a channel shows in the page console (F12):

```js
// expected true with Turbo or a sub, false otherwise
!!document.querySelector('[data-a-target="video-player"] [data-a-target="player-seekbar"]');
```

- [ ] Open a channel that is live right now: the video area stays dark and silent for a moment, then playback starts at the beginning of the stream, not at the live edge (switch "Hide seek bar" off afterwards to check the position). No live picture or sound before that.
- [ ] Same after clicking a live channel in the sidebar or on the home page (navigation without reload), and after reloading the page.
- [ ] Channel A, then channel B, then back to A without reload: each starts from the beginning.
- [ ] Clicking "Live" afterwards jumps to the live picture and is not undone; quality changes do not jump back.
- [ ] No seek bar preview stays open after the jump ("Hide seek bar preview" off).
- [ ] Not muted: sound comes back at the previous volume, the volume slider shows it, and after reloading the page Twitch still uses that volume (not 0). Muted before: stays muted.
- [ ] Without Turbo or sub (other browser profile, logged out): the video stays dark while the stream loads and then about three more seconds (eight at most), then the stream plays live. Videos (`/videos/<id>`) and clips play as usual.
- [ ] Option off: live streams open at the live edge. Switching the option on while watching does not jump.
- [ ] Reload the extension while the video is dark: the video does not stay dark or silent.
- [ ] Clicking another live channel while the video is still dark: the previous channel's live picture and sound do not show in between.

### Kick

First grant access in the popup. Kick shows the player's control bar only
while the mouse is over the player; check the player items while hovering.
Videos often start with an ad; check the player once the video itself plays.

Video page (`/<channel>/videos/<id>`):

- [ ] Current time and duration hidden, the " / " between them too.
- [ ] Only "Hide duration" on: the current time is visible, the duration not. Only "Hide current time" on: the reverse.
- [ ] Seek bar hidden; with "Hide seek bar" off, no time or preview image when hovering it.
- [ ] Chat replay collapsed; the "Chat" button that opens it again is not shown. Switching the option off opens the chat again.
- [ ] Jump buttons (if switched on) next to play and in the middle of the video; they seek.
- [ ] Optional: the title under the player shows "Title hidden"; no tooltip on it.

Clip page (`/<channel>/clips/<clip id>`) and clip dialog (click a clip on a channel's clips tab):

- [ ] Time, duration and seek bar hidden. In the dialog time and duration are one label ("00:05 / 00:17"); it is hidden when either option is on.
- [ ] Optional: with "Hide titles of streams, videos and clips" and "Hide the full title on hover" both on, the dialog shows "Title hidden" and no tooltip.

Lists (home page, browse, category pages, channel videos and clips tabs):

- [ ] Video and clip thumbnails blurred, live thumbnails not (unless enabled).
- [ ] No lengths on video and clip cards; views and viewer counts still visible.
- [ ] Hovering a clip card plays no preview.
- [ ] Optional: category, tags, avatar, streamer name and titles on cards hidden; carousel on the home page and "Recommended" in the sidebar hidden.

Live channel:

- [ ] No time next to the "LIVE" button in the player bar.
- [ ] Live chat stays open.
- [ ] Optional: on the channel's videos, clips and about tabs the card over the player ("Watch now") shows "Title hidden".

Live from the start (switch on "Start live streams from the beginning"; works
without an account):

- [ ] Open a channel that is live right now: the video area stays dark and silent for a moment, then playback starts at the beginning of the stream ("Go to LIVE" appears in the player bar). No live picture or sound before that.
- [ ] Same after clicking a live channel in the sidebar or on the home page, and after reloading.
- [ ] Clicking "Go to LIVE" afterwards jumps to the live picture and is not undone.
- [ ] Not muted: sound comes back at the previous volume after the jump. Muted before: stays muted.
- [ ] After reloading the page and after switching channels, the player still uses the previous volume (not 0). Kick keeps it in the cookie `volume` (F12, Application, Cookies).
- [ ] Clicking another live channel in the sidebar while the video is still dark: the previous channel's live picture does not show in between, the new channel starts from its beginning as well, and nothing stays dark or silent.
- [ ] Pull the volume slider to 0 after the jump, then click another live channel within a few seconds: the new stream stays silent. Without touching the volume it plays at the previous volume.
- [ ] An ad that starts right after the jump plays normally; the stream after it starts from its beginning.
- [ ] Option off: live streams open at the live edge. Videos and clips play as usual.

## When something is not hidden

The site probably changed its markup. In the browser's inspector, find the
element, note its stable attributes (`data-a-target`, `data-test-selector`,
`aria-*`, tag names), add a reduced copy to the fixtures with
`data-expect-hidden="<option>"`, extend the selector list in the platform's
`content.css` or `content.js`, and run `npm test`.
