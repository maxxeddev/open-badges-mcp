import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDataDir } from "../src/cli.js";

describe("resolveDataDir", () => {
  let originalXdg: string | undefined;

  beforeEach(() => {
    originalXdg = process.env.XDG_DATA_HOME;
  });

  afterEach(() => {
    if (originalXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdg;
    }
  });

  it("respects --data-dir override and marks as explicit", () => {
    delete process.env.XDG_DATA_HOME;
    const result = resolveDataDir("/custom/path");
    expect(result.dataDir).toBe("/custom/path");
    expect(result.isExplicit).toBe(true);
  });

  it("respects XDG_DATA_HOME when no override provided and marks as explicit", () => {
    process.env.XDG_DATA_HOME = "/tmp/xdg";
    const result = resolveDataDir();
    expect(result.dataDir).toBe("/tmp/xdg/mcp-ob-ts/data");
    expect(result.isExplicit).toBe(true);
  });

  it("defaults to bundled data/ directory when no override and no XDG_DATA_HOME", () => {
    delete process.env.XDG_DATA_HOME;
    const result = resolveDataDir();
    // Should point to the bundled data dir relative to src/
    expect(result.dataDir).toMatch(/data$/);
    expect(result.isExplicit).toBe(false);
  });
});

describe("package.json bin entry", () => {
  it("has correct bin entry for mcp-ob-ts", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.bin["mcp-ob-ts"]).toBe("dist/cli.js");
  });
});
