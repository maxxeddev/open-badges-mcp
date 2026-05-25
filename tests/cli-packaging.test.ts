import { readFileSync } from "node:fs";
import { homedir } from "node:os";
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

  it("respects --data-dir override", () => {
    delete process.env.XDG_DATA_HOME;
    expect(resolveDataDir("/custom/path")).toBe("/custom/path");
  });

  it("respects XDG_DATA_HOME when no override provided", () => {
    process.env.XDG_DATA_HOME = "/tmp/xdg";
    expect(resolveDataDir()).toBe("/tmp/xdg/mcp-ob-ts/data");
  });

  it("defaults to ~/.mcp-ob-ts/data/ when no override and no XDG_DATA_HOME", () => {
    delete process.env.XDG_DATA_HOME;
    expect(resolveDataDir()).toBe(join(homedir(), ".mcp-ob-ts", "data"));
  });
});

describe("package.json bin entry", () => {
  it("has correct bin entry for mcp-ob-ts", () => {
    const pkgPath = join(import.meta.dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.bin["mcp-ob-ts"]).toBe("dist/cli.js");
  });
});
