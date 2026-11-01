# No Spoilers

Browser extension for Firefox and Chrome that hides spoilers on video sites:
video time, progress bars, durations on thumbnails, comments, chat replay,
recommendations and end screens. One code base, Manifest V3, one module per
site.

Supported sites: **YouTube** and **Twitch**. More can be added as platform
modules without touching the core (see [Adding a platform](#adding-a-platform)).

![Demo GIF](images/demo.gif)

## Features

The toolbar icon shows whether protection is on (red) or off (grey). Click it
to open the popup:

- On YouTube or Twitch, the popup shows that site's settings at the top and
  the other sites collapsed below.
- On any other page, it shows an overview with one row per site.
- "All settings" opens the options page with every site and the keyboard
  shortcut.

Changes apply immediately in all open tabs, no reload needed.

Keyboard shortcut to switch protection on and off: `Ctrl+Alt+U` in Firefox,
`Alt+Shift+U` in Chrome (`Command+Shift+U` on macOS). Chrome does not allow
`Ctrl+Alt` shortcuts. Both can be changed: Firefox on the options page,
Chrome on `chrome://extensions/shortcuts`.

### YouTube

| Option | Default |
|---|---|
| Hide current time and duration in the player | on |
| Hide progress bar and chapter title | on |
| Hide end screen and end cards | on |
| Turn off autoplay (switched back on when protection is turned off) | on |
| Skip buttons -10, -5, +5, +10 minutes next to the play button | off |
| Seek controls in the middle of the video on hover (-10m, -1m, -10s, play/pause, +10s, +1m, +10m) | off |
| Hide comments | on |
| Hide description and chapter list | on |
| Hide recommendations next to the video | on |
| Hide live chat and chat replay | on |
| Hide durations on thumbnails (home, search, recommendations) | on |
| Hide watch progress bars on thumbnails | on |
| Hide video titles (watch page, player, thumbnails, browser tab) | off |
| Hide title tooltips | off |

### Twitch

| Option | Default |
|---|---|
| Hide current time and duration in the player | on |
| Hide progress in the seek bar | on |
| Hide seek bar hover preview | on |
| Hide recommendations at the end of a video | on |
| Skip buttons next to play on videos (-10, -5, +5, +10 min) | off |
| Seek controls in the middle of videos on hover | off |
| Hide chat replay on videos | on |
| Hide chat on live streams | off |
| Blur video and clip thumbnails | on |
| Blur live stream thumbnails | off |
| Hide video and clip lengths | on |
| Hide watch progress bars on videos | on |
| Disable video previews on hover | on |
| Hide category, tags, streamer avatar, streamer name on cards | off |
| Hide titles of streams, videos and clips | off |
| Hide title tooltips | off |
| Hide featured carousel on the home page | off |
| Hide recommended channels / categories in the sidebar | off |
| Hide stream uptime | on |

Twitch needs access to `twitch.tv`, which the extension asks for when you
first open the Twitch section in the popup. YouTube access is granted on
install.

## Installation

### From the stores

- Firefox: [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/no-spoilers-youtube/)
- Chrome: not published yet

### From source

Requirements: Node.js 22 or 24 (LTS). Odd versions such as 25 work but are not supported by the test tools.

```bash
npm ci
npm run build
```

This creates `dist/firefox` and `dist/chrome`.

- **Firefox:** open `about:debugging#/runtime/this-firefox`, click
  "Load Temporary Add-on…" and select `dist/firefox/manifest.json`.
- **Chrome:** open `chrome://extensions`, enable "Developer mode", click
  "Load unpacked" and select the `dist/chrome` folder.

`npm run package` additionally writes
`dist/no-spoiler-firefox-<version>.zip` and `dist/no-spoiler-chrome-<version>.zip`.

## Development

| Command | Purpose |
|---|---|
| `npm run build` | Build both browsers (`build:firefox`, `build:chrome` for one) |
| `npm test` | Unit tests (vitest + jsdom) |
| `npm run lint` | Build Firefox and run `web-ext lint` |
| `npm run package` | Build and zip both browsers |

Manual test steps for both browsers are in [TESTING.md](TESTING.md).

### Layout

```
src/
  core/            shared by all scripts (classic scripts, one namespace)
    api.js           browser/chrome shim
    registry.js      platform registry, settings model, html classes
    storage.js       storage access and migration from 0.9.x
    content-core.js  content runtime: classes, observer, SPA navigation, helpers
    player-controls.js skip bar and centre overlay shared by all platforms
    content-start.js starts the runtime (last content script file)
  platforms/<id>/  one folder per site
    platform.json    id, label, match patterns, host access, options
    content.css      hiding rules
    content.js       optional: what CSS cannot do
  background/      install/update, icon, shortcut, content script registration
  popup/           toolbar popup
  options/         "All settings" page
  ui/              settings UI shared by popup and options page
scripts/
  build.mjs        builds dist/<browser> and the manifests
  manifest.base.json
test/              unit tests and DOM fixtures
```

There is no bundler: what ships is the source. All scripts are classic
scripts that share the `globalThis.NoSpoiler` namespace, because MV3 content
scripts cannot be ES modules. The build copies `src/`, generates the
manifest per browser and `core/platforms.generated.js` from the
`platform.json` files.

Browser differences are handled in `scripts/build.mjs`:

| | Firefox | Chrome |
|---|---|---|
| Background | `background.scripts` (event page) | `background.service_worker` |
| `browser_specific_settings` | Gecko ID, minimum version, data collection | removed |
| Shortcut | `Ctrl+Alt+U` | `Alt+Shift+U` |

At runtime `NoSpoiler.api` is `browser` in Firefox and `chrome` in Chrome;
both return Promises in MV3, so no polyfill is needed.

### How hiding works

The content script runs at `document_start` and sets classes on `<html>`:
`ns-on` while protection is on for the site, and `ns-<platform>-<option>` for
every option that is on. All hiding rules in `content.css` hang on these
classes, so switching is a class change: instant, no reload, no flicker.
Until the settings are read, the defaults apply (fail closed).

JavaScript is used only where CSS cannot decide: checking whether a badge
shows a duration, inserting skip buttons, switching autoplay, removing
`title` tooltips. One throttled `MutationObserver` per page calls the
platform's `update(ctx)` hook. Every change made by JavaScript is undone when
the option or the protection is switched off.

The extension makes no network requests.

## Adding a platform

1. Create `src/platforms/<id>/platform.json`:

   ```json
   {
     "id": "example",
     "label": "Example",
     "matches": ["https://*.example.com/*"],
     "order": 30,
     "hostAccess": "optional",
     "contentScript": true,
     "options": [
       { "key": "hideDuration", "label": "Hide video duration", "default": true, "group": "Player" }
     ]
   }
   ```

   - `id` equals the folder name (lowercase letters and digits).
   - `hostAccess: "optional"` for every new site. Users grant access from the
     popup; a required permission would make Firefox hold the update for all
     existing users until they accept it.
   - Option keys are camelCase, `enabled` is reserved.

2. Create `src/platforms/<id>/content.css`. Scope every rule to the classes:

   ```css
   html.ns-on.ns-example-hideDuration .player-duration {
     display: none !important;
   }
   ```

   Prefer stable attributes (`data-*`, `aria-*`, `href`) over class names
   and list fallback selectors for older and newer layouts.

3. Optional: `src/platforms/<id>/content.js` for what CSS cannot do:

   ```js
   "use strict";
   (function (root) {
     const NS = root.NoSpoiler;
     NS.definePlatform("example", {
       navigationEvents: [], // custom SPA events, if the site has any
       update(ctx) {
         // ctx.reason: "state" | "mutation" | "navigate"
         // ctx.active, ctx.options, ctx.document, ctx.url
         // Make the DOM match ctx; undo your changes when !ctx.active.
       },
     });
   })(globalThis);
   ```

   Helpers in `NoSpoiler.dom`: `isDuration`, `queryAll`, `queryFirst`,
   `badgeFor`, `stashTitles`, `restoreTitles`, `clearAttr`. Seek controls in
   `NoSpoiler.player`: `ensureSkipBar`, `ensureOverlay`, `remove`.

4. Add fixtures to `test/fixtures/` (see its README) and a test like
   `test/twitch.test.js`. Every option needs at least one
   `data-expect-hidden` element.

5. `npm test && npm run lint`. Popup, options page, manifest and permissions
   pick up the new platform automatically.

## Updating from 0.9.x

The Firefox add-on keeps its ID, so existing installations update from AMO.
On update the settings are migrated: the old "show" options become the new
"hide" options, the on/off state is kept, and the old keys are removed.

## Feedback and support

Please report problems and ideas [as an issue](https://github.com/0skater0/no-spoiler/issues).
When a site changed its layout and something is no longer hidden, the page
URL and the option name help most.

## License

MIT, see [LICENSE](LICENSE). Provided as-is without warranty.

### Support me and my work

This extension is free. If you would like to buy me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P5P7NLC40)
