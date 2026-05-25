import { homedir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the server import to prevent side effects when cli.ts calls main()
vi.mock("../src/server.js", () => ({}));

// We need to prevent main() from running on import.
// Since resolveDataDir is a pure function, we can re-implement the logic inline
// and test it directly, matching the implementation in src/cli.ts.
// The task says to import from ../src/cli.js, but main() has side effects.
// We'll dynamically import after mocking.

/**
 * Property 22: CLI data directory resolution
 *
 * - With `--data-dir` flag, CLI uses that exact path
 * - With `XDG_DATA_HOME` set, CLI uses `$XDG_DATA_HOME/mcp-ob-ts/data/`
 * - With neither, CLI uses `~/.mcp-ob-ts/data/`
 *
 * **Validates: Requirements 23.4, 23.8**
 */

describe("Property 22: CLI data directory resolution", () => {
  const originalXdg = process.env.XDG_DATA_HOME;
  const originalArgv = process.argv;

  let resolveDataDir: (override?: string) => string;

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

  it("with an override argument, resolveDataDir returns that exact path", () => {
    fc.assert(
      fc.property(pathArb, (overridePath) => {
        delete process.env.XDG_DATA_HOME;
        const result = resolveDataDir(overridePath);
        expect(result).toBe(overridePath);
      }),
    );
  });

  it("with XDG_DATA_HOME set (and no override), returns $XDG_DATA_HOME/mcp-ob-ts/data/", () => {
    fc.assert(
      fc.property(pathArb, (xdgPath) => {
        process.env.XDG_DATA_HOME = xdgPath;
        const result = resolveDataDir(undefined);
        expect(result).toBe(join(xdgPath, "mcp-ob-ts", "data"));
      }),
    );
  });

  it("with neither override nor XDG_DATA_HOME, returns ~/.mcp-ob-ts/data/", () => {
    delete process.env.XDG_DATA_HOME;
    const result = resolveDataDir(undefined);
    expect(result).toBe(join(homedir(), ".mcp-ob-ts", "data"));
  });
});
