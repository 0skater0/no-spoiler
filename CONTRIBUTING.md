# Contributing

How to set the project up locally, how it is built, and what to watch out
for when you send a pull request.

## Development setup

You need Node.js 22 or 24 (LTS), npm, Git, and Firefox and/or Chrome for
testing.

```bash
npm ci
npm run build      # dist/firefox and dist/chrome
npm test           # unit tests (vitest + jsdom)
npm run lint       # web-ext lint on dist/firefox
npm run package    # build and zip both browsers into dist/
```

Load the build as described in the [README](README.md#manually-latest-build-or-development).
After a change, run `npm run build` and reload the extension
(`about:debugging` → *Reload* in Firefox, the reload icon on
`chrome://extensions` in Chrome).

## Dependencies

- Development dependencies only. The extension itself has no runtime
  dependencies and loads no remote code; ask in an issue before proposing one.
- Only versions that have been published for at least 7 days. Install with
  `npm install --before=<date seven days ago>` and commit the lockfile.
  Dependabot uses the same cooldown.

## Architecture

There is no bundler: what ships is the source, which keeps store reviews
simple (no source upload needed on AMO). All scripts are classic scripts that
share the `globalThis.NoSpoiler` namespace, because MV3 content scripts cannot
be ES modules. The build copies `src/`, generates one manifest per browser and
`core/platforms.generated.js` from the `platform.json` files.

Browser differences are handled in `scripts/build.mjs`:

| | Firefox | Chrome |
|---|---|---|
| Background | `background.scripts` (event page) | `background.service_worker` |
| `browser_specific_settings` | Gecko ID, minimum version, data collection | removed |
| Shortcut | `Ctrl+Alt+U` | `Alt+Shift+U` (Chrome rejects `Ctrl+Alt`) |

At runtime `NoSpoiler.api` is `browser` in Firefox and `chrome` in Chrome;
both return Promises in MV3, so no polyfill is needed.

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
   - Options are switches by default. `"type": "steps"` with `"choices"`
     (seconds) and a `"default"` subset renders a picker for jump sizes.
     `"dependsOn": "<switch key>"` greys an option out while that switch is off.

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

## Finding selectors on a live site

Sites change their markup. To see what the extension can target, open the
page, the browser console (F12) and run `scripts/dom-snapshot.js` there (copy
its content into the console). It waits six seconds, so you can hover a
tooltip or the seek bar, and stores a reduced structure of the page in
`nsDump`; `copy(nsDump)` puts it on the clipboard. It records tag names,
attributes and short text snippets only. Reduce the relevant part into a
fixture under `test/fixtures/` and remove personal data first.

Prefer, in this order: `data-a-target` / `data-test-selector` and similar
test attributes, `aria-*` and `role`, `href` patterns, tag names. Generated
class names (`ScCoreButton-sc-…`) change with every deploy.

## Coding conventions

- Comments and user-facing text are English. Explain why, not what.
- CSS first. JavaScript only where CSS cannot decide, and every change made
  by JavaScript is undone when the option or the protection is switched off.
- One throttled `MutationObserver` per page (the core's), no timers that
  retry, no `console` output in normal operation.
- No network requests, no remote code, no new permissions without discussion.

## Commit messages

- Short title, 70 characters or fewer, imperative mood, no trailing period.
- Body explains why, not what. The diff already says what.
- No `Co-Authored-By` trailers, no emoji in titles.
- Reference the issue in the title when applicable: `Fix #42 ...`.

## Pull requests

Fill in the template. `npm test` and `npm run lint` must pass, user-visible
changes go into `CHANGELOG.md` under `## [Unreleased]`, and selector changes
come with an updated fixture.

## Release process

1. Bump `version` in `package.json` (`npm version <x.y.z> --no-git-tag-version`).
2. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new heading
   `## [x.y.z] - YYYY-MM-DD`.
3. Merge to `main`.
4. Tag the merge commit `vx.y.z` and push the tag. The release workflow runs
   the tests, builds both zips and creates a GitHub release with the
   changelog section as notes.
5. Upload the zips to the stores, see [docs/STORE.md](docs/STORE.md).
