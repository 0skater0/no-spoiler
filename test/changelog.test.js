import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { changelogSection } from "../scripts/lib/changelog.mjs";
import { ROOT } from "./helpers/env.js";

describe("changelog extraction", () => {
  it("returns exactly the section of one version", () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "ns-cl-")), "CHANGELOG.md");
    writeFileSync(file, "# Changelog\n\n## [Unreleased]\n\n## [1.1.0] - 2026-12-01\n\n### Added\n\n- New thing\n\n## [1.0.0] - 2026-11-01\n\nOld\n\n[1.1.0]: https://x\n");
    expect(changelogSection(file, "1.1.0")).toBe("### Added\n\n- New thing");
    expect(changelogSection(file, "1.0.0")).toBe("Old");
    expect(changelogSection(file, "9.9.9")).toBe("");
  });

  it("has a non-empty section for the current package version", async () => {
    const { version } = (await import("../package.json", { with: { type: "json" } })).default;
    expect(changelogSection(path.join(ROOT, "CHANGELOG.md"), version)).not.toBe("");
  });
});
