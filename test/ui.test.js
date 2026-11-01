import { beforeEach, describe, expect, it } from "vitest";
import { flush, loadExtension } from "./helpers/env.js";

let NS, api;
beforeEach(async () => {
  document.body.innerHTML = "";
  ({ NS, api } = await loadExtension(["ui/settings-ui.js", "popup/popup.js", "options/options.js"]));
});

describe("popup view", () => {
  it("focuses the platform of the active tab", () => {
    expect(NS.popupView("https://www.youtube.com/watch?v=1").platform.id).toBe("youtube");
    expect(NS.popupView("https://www.twitch.tv/videos/1").platform.id).toBe("twitch");
    expect(NS.popupView("https://clips.twitch.tv/Slug").platform.id).toBe("twitch");
  });

  it("shows the overview elsewhere", () => {
    for (const url of ["https://example.org/", "about:addons", "chrome://extensions/", ""]) {
      expect(NS.popupView(url).kind).toBe("overview");
    }
  });
});

describe("platform section", () => {
  it("renders one switch per option plus the platform switch", async () => {
    const yt = NS.getPlatform("youtube");
    const { state } = await NS.ui.load();
    const el = NS.ui.platformSection(yt, state, true, {});
    const booleans = yt.options.filter((o) => NS.optionType(o) === "boolean");
    expect(el.querySelectorAll('input[role="switch"]')).toHaveLength(booleans.length + 1);
    expect(el.querySelectorAll(".ns-steps")).toHaveLength(yt.options.length - booleans.length);
    expect([...el.querySelectorAll("legend")].map((l) => l.textContent)).toEqual(["Player", "Jump buttons", "Watch page", "Thumbnails", "Titles"]);
  });

  it("writes changes to storage immediately", async () => {
    const yt = NS.getPlatform("youtube");
    const { state } = await NS.ui.load();
    const el = NS.ui.platformSection(yt, state, true, {});
    const input = el.querySelector('[data-focus-id="youtube.hideComments"]');
    input.checked = false;
    input.dispatchEvent(new Event("change"));
    await flush();
    expect(await api.storage.sync.get("youtube.hideComments")).toEqual({ "youtube.hideComments": false });
  });

  it("asks for access before showing options of an optional platform", async () => {
    const tw = NS.getPlatform("twitch");
    const { state, access } = await NS.ui.load();
    expect(access.twitch).toBe(false);
    const el = NS.ui.platformSection(tw, state, access.twitch, {});
    expect(el.querySelector('input[role="switch"]')).toBeNull();
    el.querySelector("button").click();
    expect((await NS.ui.load()).access.twitch).toBe(true);
  });

  it("summarises collapsed rows", async () => {
    const yt = NS.getPlatform("youtube");
    const { state } = await NS.ui.load();
    const booleans = yt.options.filter((o) => NS.optionType(o) === "boolean");
    const on = booleans.filter((o) => o.default).length;
    expect(NS.ui.summary(yt, state, true)).toBe(`${on} of ${booleans.length} on`);
    state.platforms.youtube.enabled = false;
    expect(NS.ui.summary(yt, state, true)).toBe("Off");
    expect(NS.ui.summary(yt, state, false)).toBe("No access yet");
  });

  it("re-renders on storage changes and keeps sections open", async () => {
    const box = document.createElement("div");
    document.body.appendChild(box);
    let renders = 0;
    await NS.ui.mount(box, ({ state, access }, { openIds }) => {
      renders++;
      return NS.platforms.map((p) => NS.ui.platformSection(p, state, access[p.id], { collapsible: true, open: openIds.has(p.id) }));
    });
    box.querySelector('details[data-platform="youtube"]').open = true;
    await NS.setOption("youtube", "hideChat", false);
    await flush();
    await flush();
    expect(renders).toBe(2);
    expect(box.querySelector('details[data-platform="youtube"]').open).toBe(true);
  });
});

describe("jump size picker", () => {
  it("is disabled while its switch is off and stores the chosen sizes", async () => {
    const yt = NS.getPlatform("youtube");
    let { state } = await NS.ui.load();
    let el = NS.ui.platformSection(yt, state, true, {});
    const chip = () => el.querySelector('[data-focus-id="youtube.skipButtonSteps.30"]');
    expect(chip().disabled).toBe(true);

    await NS.setOption("youtube", "skipButtons", true);
    ({ state } = await NS.ui.load());
    el = NS.ui.platformSection(yt, state, true, {});
    expect(chip().disabled).toBe(false);
    chip().click();
    await flush();
    expect((await api.storage.sync.get("youtube.skipButtonSteps"))["youtube.skipButtonSteps"]).toEqual([30, 300, 600]);
  });

  it("formats sizes", () => {
    expect([5, 60, 300, 3600].map(NS.ui.formatSeconds)).toEqual(["5 s", "1 min", "5 min", "1 h"]);
  });
});

describe("shortcut capture", () => {
  const ev = (o) => ({ ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o });
  it("builds Firefox shortcut strings", () => {
    expect(NS.shortcutFromEvent(ev({ ctrlKey: true, altKey: true, code: "KeyU" }), false)).toBe("Ctrl+Alt+U");
    expect(NS.shortcutFromEvent(ev({ metaKey: true, shiftKey: true, code: "Digit5" }), true)).toBe("Command+Shift+5");
    expect(NS.shortcutFromEvent(ev({ ctrlKey: true, code: "F5" }), false)).toBe("Ctrl+F5");
  });
  it("rejects combinations without a primary modifier", () => {
    expect(NS.shortcutFromEvent(ev({ shiftKey: true, code: "KeyU" }), false)).toBeNull();
    expect(NS.shortcutFromEvent(ev({ ctrlKey: true, code: "ControlLeft" }), false)).toBeNull();
  });
});
