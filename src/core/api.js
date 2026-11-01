/*
 * Shared namespace and WebExtension API shim.
 *
 * Every script of the extension (background, content scripts, popup, options)
 * is a classic script. They share one namespace object, `NoSpoiler`, instead
 * of ES module imports, because MV3 content scripts cannot be modules.
 *
 * Firefox exposes `browser.*`, Chrome exposes `chrome.*`. In MV3 both return
 * Promises, so no polyfill is needed.
 */
"use strict";

(function (root) {
  const NS = (root.NoSpoiler = root.NoSpoiler || {});

  NS.api = root.browser ?? root.chrome;

  /** True when this script runs in an extension whose context is gone (old content script after an update). */
  NS.isContextInvalid = function () {
    try {
      return !NS.api?.runtime?.id;
    } catch {
      return true;
    }
  };
})(globalThis);
