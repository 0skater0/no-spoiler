# Security Policy

## Reporting a vulnerability

If you discover a security issue in this extension, please report it privately by opening a [security advisory](https://github.com/0skater0/no-spoiler/security/advisories/new) on GitHub. Do not open a public issue for security reports.

I aim to acknowledge reports within five working days and to publish a fix in the next release where practical.

## Supported versions

Only the latest published release receives security updates. Older versions are not patched. Please update through [addons.mozilla.org](https://addons.mozilla.org/firefox/addon/no-spoilers-youtube/), the [Chrome Web Store](https://chromewebstore.google.com/detail/hmklilohlfdjlhpmdlidpfklabdopahk) or the [Releases](https://github.com/0skater0/no-spoiler/releases) page.

## What the extension can access

| Permission | Why |
|---|---|
| `storage` | Saves your settings and the on/off state. |
| `scripting` | Registers the content script of a site after you granted access to it, and applies the extension to tabs that were already open. |
| `activeTab` | Lets the popup read the address of the current tab to show that site's settings first. No browsing history is read. |
| Optional host access to `*.youtube.com` | Runs the content script on YouTube, only after you allowed it. |
| Optional host access to `*.twitch.tv` | Runs the content script on Twitch, only after you allowed it. |

The extension asks for no site access at install time. You grant each site on the welcome page, in the popup or on the settings page, and can revoke it in the browser's extension settings.

The content scripts change the pages' appearance with CSS classes and, where CSS is not enough, small DOM changes (data attributes, inserted jump buttons, moved `title` attributes). They do not read form fields, cookies or account data, do not send anything anywhere, and load no remote code. The extension makes no network requests.

## Dependency triage policy

The extension has no runtime dependencies; everything in `package.json` is a development dependency (test runner, DOM emulation, `web-ext`) and none of it ships in the packages. Dependabot alerts for these tools are assessed against how they are used, locally and in CI on trusted input. Alerts that cannot affect the build output or a developer machine running the documented commands are dismissed with the reason `Risk tolerated` and a comment pointing back to this section. Updates are only taken once a version has been published for at least seven days.
