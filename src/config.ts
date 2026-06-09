import { readdirSync } from "node:fs";
import { join } from "node:path";

// When running via npx/CLI, data lives in the user's home directory.
// When running from the repo (dev mode), data lives in the project.
export function getBaseDataDir(): string {
  if (process.env.MCP_OB_DATA_DIR) {
    return process.env.MCP_OB_DATA_DIR;
  }
  return join(import.meta.dirname, "..", "data");
}

/**
 * Default maximum response size in bytes for the Output_Bounding_Utility.
 * Configurable via MCP_OB_MAX_RESPONSE_BYTES environment variable.
 * Default: 50 KiB — large enough for most single credentials, small enough
 * to stay sandbox-friendly.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 50 * 1024; // 50 KiB

export function getMaxResponseBytes(): number {
  const env = process.env.MCP_OB_MAX_RESPONSE_BYTES;
  if (env) {
    const parsed = Number.parseInt(env, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_RESPONSE_BYTES;
}

export function resolveSnapshotPath(version?: string): string {
  const snapshotsDir = join(getBaseDataDir(), "snapshots");
  if (version) {
    return join(snapshotsDir, version);
  }
  // Default to latest: pick the directory with the highest semver
  const dirs = readdirSync(snapshotsDir).sort();
  const latest = dirs[dirs.length - 1];
  if (!latest) {
    throw new Error("No snapshot found in data/snapshots/. Run pnpm data:fetch first.");
  }
  return join(snapshotsDir, latest);
}

export function resolveDataPath(filename: string): string {
  return join(getBaseDataDir(), filename);
}
