import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = "3.0.3";
const SNAPSHOT_DIR = join("data", "snapshots", VERSION);

const SOURCES = [
  {
    url: "https://purl.imsglobal.org/spec/vc/ob/vocab.ttl",
    filename: "vocab.ttl",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    filename: "context.json",
  },
  {
    url: "https://www.imsglobal.org/spec/ob/v3p0/",
    filename: "ob3-spec.html",
  },
  {
    url: "https://www.w3.org/TR/vc-data-model-2.0/",
    filename: "vc-spec.html",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json",
    filename: "achievement-credential.schema.json",
  },
  {
    url: "https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_endorsementcredential_schema.json",
    filename: "endorsement-credential.schema.json",
  },
];

async function main() {
  mkdirSync(SNAPSHOT_DIR, { recursive: true });

  for (const source of SOURCES) {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
    }
    const content = await response.text();
    writeFileSync(join(SNAPSHOT_DIR, source.filename), content, "utf-8");
    console.log(`Downloaded ${source.filename}`);
  }

  const manifest = {
    version: VERSION,
    fetchDate: new Date().toISOString(),
    sources: SOURCES.map((s) => ({ url: s.url, filename: s.filename })),
  };

  writeFileSync(join(SNAPSHOT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  console.log("Wrote manifest.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
