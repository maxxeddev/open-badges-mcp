import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getBaseDataDir, resolveDataPath, resolveSnapshotPath } from "../src/config.js";

describe("Config data directory resolution", () => {
  const originalEnv = process.env.MCP_OB_DATA_DIR;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MCP_OB_DATA_DIR;
    } else {
      process.env.MCP_OB_DATA_DIR = originalEnv;
    }
  });

  it("getBaseDataDir uses MCP_OB_DATA_DIR when set", () => {
    process.env.MCP_OB_DATA_DIR = "/tmp/custom-data";
    expect(getBaseDataDir()).toBe("/tmp/custom-data");
  });

  it("getBaseDataDir falls back to project-relative data/ when env var not set", () => {
    delete process.env.MCP_OB_DATA_DIR;
    const result = getBaseDataDir();
    expect(result).toMatch(/data$/);
    expect(result).not.toContain("/tmp/");
  });

  it("resolveSnapshotPath uses MCP_OB_DATA_DIR when set", () => {
    process.env.MCP_OB_DATA_DIR = "/tmp/custom-data";
    const result = resolveSnapshotPath("3.0.3");
    expect(result).toBe("/tmp/custom-data/snapshots/3.0.3");
  });

  it("resolveSnapshotPath falls back to project-relative path in dev mode", () => {
    delete process.env.MCP_OB_DATA_DIR;
    const result = resolveSnapshotPath("3.0.3");
    expect(result).toContain(join("data", "snapshots", "3.0.3"));
  });

  it("resolveDataPath uses MCP_OB_DATA_DIR when set", () => {
    process.env.MCP_OB_DATA_DIR = "/tmp/custom-data";
    const result = resolveDataPath("index.db");
    expect(result).toBe("/tmp/custom-data/index.db");
  });

  it("resolveDataPath falls back to project-relative path in dev mode", () => {
    delete process.env.MCP_OB_DATA_DIR;
    const result = resolveDataPath("index.db");
    expect(result).toContain(join("data", "index.db"));
  });

  it("resolveSnapshotPath without version finds latest snapshot in dev mode", () => {
    delete process.env.MCP_OB_DATA_DIR;
    const result = resolveSnapshotPath();
    expect(result).toContain(join("data", "snapshots", "3.0.3"));
  });
});
