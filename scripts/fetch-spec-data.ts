import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadSources } from "../src/sources.js";

const SNAPSHOT_DIR = join("data", "snapshots", "3.0.3");

async function main() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  const { sources } = loadSources();

  for (const source of sources) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
    }
    const content = await response.text();
    const destPath = join(SNAPSHOT_DIR, source.dest);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, content, "utf-8");
    console.log(`Downloaded ${source.id} → ${source.dest}`);
  }

  const manifest = {
    version: "3.0.3",
    fetchDate: new Date().toISOString(),
    sources: sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      spec: s.spec,
      version: s.version,
      url: s.url,
      filename: s.dest,
      dest: s.dest,
    })),
  };

  writeFileSync(join(SNAPSHOT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log("Wrote manifest.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
