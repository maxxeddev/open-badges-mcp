import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the server import to prevent side effects when cli.ts calls main()
vi.mock("../src/server.js", () => ({}));

/**
 * Property 22: CLI data directory resolution
 *
 * - With `--data-dir` flag, CLI uses that exact path (isExplicit: true)
 * - With `XDG_DATA_HOME` set, CLI uses `$XDG_DATA_HOME/mcp-ob-ts/data/` (isExplicit: true)
 * - With neither, CLI uses the bundled data/ directory (isExplicit: false)
 *
 * **Validates: Requirements 23.4, 23.8**
 */

describe("Property 22: CLI data directory resolution", () => {
  const originalXdg = process.env.XDG_DATA_HOME;
  const originalArgv = process.argv;

  let resolveDataDir: (override?: string) => { dataDir: string; isExplicit: boolean };

  beforeEach(async () => {
    // Ensure main() doesn't do anything harmful by setting up env so it skips init
    process.argv = ["node", "cli.js"]; // no --init flag
    delete process.env.XDG_DATA_HOME;

    // Dynamic import to get the exported function
    const cli = await import("../src/cli.js");
    resolveDataDir = cli.resolveDataDir;
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalXdg === undefined) {
      delete process.env.XDG_DATA_HOME;
    } else {
      process.env.XDG_DATA_HOME = originalXdg;
    }
  });

  // Generate random absolute path strings (start with /, contain alphanumeric + slashes)
  const pathArb = fc.stringMatching(/^\/[a-zA-Z0-9/_.-]{1,100}$/).filter((s) => s.length > 1);

  it("with an override argument, resolveDataDir returns that exact path and isExplicit true", () => {
    fc.assert(
      fc.property(pathArb, (overridePath) => {
        delete process.env.XDG_DATA_HOME;
        const result = resolveDataDir(overridePath);
        expect(result.dataDir).toBe(overridePath);
        expect(result.isExplicit).toBe(true);
      }),
    );
  });

  it("with XDG_DATA_HOME set (and no override), returns $XDG_DATA_HOME/mcp-ob-ts/data/ and isExplicit true", () => {
    fc.assert(
      fc.property(pathArb, (xdgPath) => {
        process.env.XDG_DATA_HOME = xdgPath;
        const result = resolveDataDir(undefined);
        expect(result.dataDir).toBe(join(xdgPath, "mcp-ob-ts", "data"));
        expect(result.isExplicit).toBe(true);
      }),
    );
  });

  it("with neither override nor XDG_DATA_HOME, returns bundled data dir and isExplicit false", () => {
    delete process.env.XDG_DATA_HOME;
    const result = resolveDataDir(undefined);
    expect(result.dataDir).toMatch(/data$/);
    expect(result.isExplicit).toBe(false);
  });
});
