// Starts one muted, headless Chrome with an unpacked extension and makes sure it is
// gone afterwards, also when the callback fails.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLOSE_TIMEOUT_MS = 10_000;

export function launchOptions() {
  return {
    channel: "chrome",
    headless: true,
    // Playwright disables extensions by default; the CDP call below needs them.
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--mute-audio", "--lang=en-US", "--disable-lcd-text", "--enable-unsafe-extension-debugging"],
    locale: "en-US",
    viewport: { width: 1000, height: 800 },
    deviceScaleFactor: 1,
  };
}

/** Refuses any launch that could play sound or show a window. */
export function assertQuietLaunch(options) {
  if (options.headless !== true) throw new Error("Chrome must run headless");
  if (!options.args?.includes("--mute-audio")) throw new Error("Chrome must run with --mute-audio");
  if (options.args.some((a) => a.includes("autoplay"))) throw new Error("Autoplay flags are not allowed");
  if (options.ignoreDefaultArgs === true || options.ignoreDefaultArgs?.includes("--mute-audio")) {
    throw new Error("--mute-audio must not be removed from the default arguments");
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs fn(context, extensionId) with the extension in distDir loaded.
 * Branded Chrome ignores --load-extension, so the extension is loaded over the
 * CDP pipe (Extensions.loadUnpacked), which needs --enable-unsafe-extension-debugging.
 */
export async function withExtension(distDir, fn) {
  const { chromium } = await import("playwright-core");
  const options = launchOptions();
  assertQuietLaunch(options);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ns-store-"));
  let ctx;
  let pid;
  try {
    ctx = await chromium.launchPersistentContext(profile, options);
    const cdp = await ctx.browser().newBrowserCDPSession();
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    pid = processInfo.find((p) => p.type === "browser")?.id;
    // Extension pages ask for host access; report it as granted so every toggle renders.
    await ctx.addInitScript(() => {
      try {
        chrome.permissions.contains = async () => true;
      } catch {
        // Not an extension page.
      }
    });
    const { id } = await cdp.send("Extensions.loadUnpacked", { path: path.resolve(distDir) });
    return await fn(ctx, id);
  } finally {
    if (ctx) {
      await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS).unref())]).catch(() => {});
    }
    if (pid && isAlive(pid)) process.kill(pid, "SIGKILL");
    // A locked profile must not hide the error of fn or the launch.
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (err) {
      console.warn(`Could not remove the Chrome profile ${profile}: ${err.message}`);
    }
  }
}
