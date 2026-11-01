import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flush, loadExtension } from "./helpers/env.js";

let NS;
beforeEach(async () => {
  ({ NS } = await loadExtension());
  document.documentElement.className = "";
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("dom helpers", () => {
  it("recognises durations", () => {
    for (const t of ["0:30", "4:05", "12:34", "1:02:03", " 59:59 "]) expect(NS.dom.isDuration(t), t).toBe(true);
    for (const t of ["LIVE", "12:34 PM", "1.2K views", "123:45", "1:2", "2 days ago", "", "12:34:5"]) {
      expect(NS.dom.isDuration(t), t).toBe(false);
    }
  });

  it("queryAll skips invalid selectors and dedupes", () => {
    document.body.innerHTML = '<p class="a b"></p>';
    expect(NS.dom.queryAll(document, [".a", "::invalid((", ".b"])).toHaveLength(1);
    expect(NS.dom.queryFirst(document, ["::invalid((", ".b"])).not.toBeNull();
  });

  it("stashes and restores title attributes", () => {
    document.body.innerHTML = '<a title="Spoiler">x</a><a>y</a>';
    NS.dom.stashTitles(document, ["a[title]"]);
    expect(document.querySelector("[title]")).toBeNull();
    NS.dom.restoreTitles(document);
    expect(document.querySelector("a").getAttribute("title")).toBe("Spoiler");
    expect(document.querySelector("[data-ns-title]")).toBeNull();
  });

  it("finds the whole badge around a duration", () => {
    document.body.innerHTML = '<a id="l"><div id="badge"><span><b id="t">1:23</b></span></div><p>other</p></a>';
    const badge = NS.dom.badgeFor(document.getElementById("t"), document.getElementById("l"));
    expect(badge.id).toBe("badge");
  });
});

describe("content runtime", () => {
  function setup(hooks = {}, url = "https://www.youtube.com/") {
    const platform = NS.getPlatform("youtube");
    let currentUrl = url;
    const rt = NS.createContentRuntime(platform, hooks, {
      document,
      getUrl: () => currentUrl,
      isContextInvalid: () => false,
    });
    return { rt, platform, setUrl: (u) => (currentUrl = u) };
  }

  it("starts fail closed with the defaults", () => {
    const { rt } = setup();
    rt.start();
    const cls = document.documentElement.classList;
    expect(cls.contains("ns-on")).toBe(true);
    expect(cls.contains("ns-youtube-hideVideoTime")).toBe(true);
    expect(cls.contains("ns-youtube-skipButtons")).toBe(false);
    rt.stop();
  });

  it("switches classes on state changes and keeps foreign classes", () => {
    document.documentElement.classList.add("site-class");
    const update = vi.fn();
    const { rt } = setup({ update });
    rt.start();
    const off = NS.defaultState();
    off.active = false;
    rt.setState(off);
    const cls = document.documentElement.classList;
    expect([...cls]).toEqual(["site-class"]);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ reason: "state", active: false }));

    const on = NS.defaultState();
    on.platforms.youtube.options.hideComments = false;
    rt.setState(on);
    expect(cls.contains("ns-on")).toBe(true);
    expect(cls.contains("ns-youtube-hideComments")).toBe(false);
    rt.stop();
  });

  it("re-adds classes when the page replaces the class attribute", () => {
    vi.useFakeTimers();
    const { rt } = setup();
    rt.start();
    document.documentElement.className = "replaced";
    rt.tick();
    expect(document.documentElement.classList.contains("ns-on")).toBe(true);
    expect(document.documentElement.classList.contains("replaced")).toBe(true);
    rt.stop();
  });

  it("runs the hook on mutations, throttled", async () => {
    vi.useFakeTimers();
    const update = vi.fn();
    const { rt } = setup({ update });
    rt.start();
    for (let i = 0; i < 20; i++) {
      document.body.appendChild(document.createElement("div"));
      await Promise.resolve(); // let MutationObserver deliver
    }
    vi.advanceTimersByTime(1);
    const after = update.mock.calls.filter((c) => c[0].reason === "mutation").length;
    expect(after).toBe(1);
    rt.stop();
  });

  it("reports SPA navigation", () => {
    vi.useFakeTimers();
    const update = vi.fn();
    const { rt, setUrl } = setup({ update });
    rt.start();
    setUrl("https://www.youtube.com/watch?v=2");
    rt.tick();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ reason: "navigate", url: "https://www.youtube.com/watch?v=2" }));
    rt.stop();
  });

  it("stops when the extension context is gone", () => {
    vi.useFakeTimers();
    const update = vi.fn();
    const platform = NS.getPlatform("youtube");
    let invalid = false;
    const rt = NS.createContentRuntime(platform, { update }, { document, getUrl: () => "x", isContextInvalid: () => invalid });
    rt.start();
    invalid = true;
    rt.tick();
    update.mockClear();
    rt.tick();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("startContent", () => {
  it("does nothing outside supported sites", () => {
    NS.startContent(); // jsdom URL is not a supported site
    expect(NS.contentRuntime).toBeUndefined();
  });

  it("follows storage changes without reload", async () => {
    const original = window.location.href;
    window.history.replaceState(null, "", "/");
    // Pretend to be on YouTube by matching the jsdom origin.
    NS.platforms.length = 0;
    NS.registerPlatforms([{ id: "youtube", label: "YouTube", matches: [`${location.origin}/*`], hostAccess: "required", contentScript: true, options: [{ key: "hideComments", label: "x", default: true }] }]);
    NS.startContent();
    await flush();
    const cls = document.documentElement.classList;
    expect(cls.contains("ns-youtube-hideComments")).toBe(true);

    await NS.setOption("youtube", "hideComments", false);
    await flush();
    await flush();
    expect(cls.contains("ns-youtube-hideComments")).toBe(false);

    await NS.setActive(false);
    await flush();
    await flush();
    expect(cls.contains("ns-on")).toBe(false);

    NS.contentRuntime.stop();
    window.history.replaceState(null, "", original);
  });
});
